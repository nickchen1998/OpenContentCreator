import { and, eq } from 'drizzle-orm'
import { accountPosts, accounts, collectionPosts, comments, connections } from '../database/schema'

type Connection = typeof connections.$inferSelect
type CommentRecord = typeof comments.$inferSelect

/** 某個會員名下、對應平台上某個帳號的連結（webhook 的 entry.id → connection） */
export async function findConnection(uid: number, platform: string, externalId: string) {
  const [row] = await useDb().select({ connection: connections }).from(connections)
    .innerJoin(accounts, eq(accounts.id, connections.accountId))
    .where(and(eq(accounts.ownerId, uid), eq(accounts.platform, platform), eq(connections.externalId, externalId)))
  return row?.connection
}

export async function ownedConnection(uid: number, accountId: number) {
  const [row] = await useDb().select({ connection: connections, platform: accounts.platform }).from(connections)
    .innerJoin(accounts, eq(accounts.id, connections.accountId))
    .where(and(eq(accounts.ownerId, uid), eq(connections.accountId, accountId)))
  return row
}

/**
 * 把選好的固定回覆真的送到平台上。成功 → sent；失敗 → 維持 ready 並記下平台回的錯誤，可以在頁面上重送。
 * 有回覆內容就公開回覆留言，有私訊內容就送一則 private reply 給留言者；兩個各自獨立，可以只做其中一個。
 */
export async function deliver(platform: MetaPlatform, connection: Connection, row: CommentRecord) {
  const db = useDb()
  if (row.status !== 'ready' || !row.externalId) return row
  let error = ''
  try {
    const token = await unseal(connection.tokenEnc)
    if (row.replyText) {
      const sent = await replyToComment(platform, token, connection.externalId, row.externalId, row.replyText)
      // 送出的回覆自己記一筆，對話串才有「我的回覆」；平台之後把同一則送回來（webhook／輪詢）時會撞到同一個 id，不會重複
      await recordOwn(connection, {
        externalId: String(sent?.id ?? ''), parentExternalId: row.externalId, externalPostId: row.externalPostId, text: row.replyText,
        reason: row.reason === '手動回覆' ? '手動回覆' : '自動回覆', collectionId: row.collectionId, postTitle: row.postTitle,
      }).catch(() => {})
    }
    // 只私訊、不回留言的：私訊失敗就是整筆失敗，維持待送出可以重送
    if (row.dmText && !row.replyText) await privateReply(platform, token, connection.externalId, row.externalId, row.dmText)
    else if (row.dmText) {
      // 公開回覆已經送出，私訊失敗不重送整筆（重送會再回一次留言），只記下原因
      try {
        await privateReply(platform, token, connection.externalId, row.externalId, row.dmText)
      }
      catch (e) {
        error = `留言已回覆，但私訊失敗：${messageOf(e)}`
      }
    }
  }
  catch (e) {
    const [failed] = await db.update(comments).set({ error: messageOf(e) }).where(eq(comments.id, row.id)).returning()
    await db.update(connections).set({ lastError: messageOf(e) }).where(eq(connections.id, connection.id))
    return failed!
  }
  const [sent] = await db.update(comments).set({ status: 'sent', error }).where(eq(comments.id, row.id)).returning()
  // 送成功了，之前留下的「連結異常」就可以清掉
  if (connection.lastError) await db.update(connections).set({ lastError: '' }).where(eq(connections.id, connection.id))
  return sent!
}

interface OwnMessage {
  externalId: string
  parentExternalId: string
  externalPostId: string
  text: string
  at?: string
  /** 自動回覆／手動回覆；從平台收回來、不知道怎麼發的留空 */
  reason?: string
  collectionId?: number | null
  postTitle?: string
  /** 貼文不在系列文裡就不記（Instagram、Facebook 只記系列文裡的） */
  onlyInSeries?: boolean
}

/** 記下一則帳號自己發的留言（送出的回覆、在平台上自己回的）。status 一律是 own，不算進任何留言數 */
export async function recordOwn(connection: Connection, message: OwnMessage) {
  if (!message.externalId || !message.text.trim()) return
  const db = useDb()
  let { collectionId, postTitle } = message
  if (collectionId === undefined) {
    const [post] = await db.select({ text: accountPosts.text, collectionId: collectionPosts.collectionId }).from(accountPosts)
      .leftJoin(collectionPosts, eq(collectionPosts.postId, accountPosts.id))
      .where(and(eq(accountPosts.accountId, connection.accountId), eq(accountPosts.externalId, message.externalPostId)))
    collectionId = post?.collectionId ?? null
    postTitle = post?.text ?? ''
  }
  if (message.onlyInSeries && collectionId == null) return
  const reason = message.reason ?? ''
  const insert = db.insert(comments).values({
    accountId: connection.accountId, collectionId: collectionId ?? null, postTitle: postTitle ?? '', author: `@${connection.externalName}`, text: message.text,
    createdAt: message.at ?? nowIso(), status: 'own', mine: true, kind: 'comment', reason,
    externalId: message.externalId, externalPostId: message.externalPostId, parentExternalId: message.parentExternalId,
  })
  // 已經從平台收回來過的同一則：只補上「自動／手動」的標記
  if (reason) await insert.onConflictDoUpdate({ target: [comments.accountId, comments.externalId], set: { reason } })
  else await insert.onConflictDoNothing()
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : '送出失敗').slice(0, 300)

interface InboundEvent {
  externalId: string
  senderId: string
  author: string
  text: string
  externalPostId: string
  /** 回覆的是哪一則留言；Threads 回在子文底下的留言也會帶（那種不算 nested） */
  parentExternalId?: string
  /** 對話裡的後續回覆（回覆別人的留言、回覆我們的回覆）：只記錄，不自動回 */
  nested?: boolean
}

/** 從 webhook（或 Threads 輪詢）收進一則留言或私訊：去重 → 跑規則 → 連結開著自動送出就直接回 */
export async function receive(boot: OwnedBoot, platform: MetaPlatform, connection: Connection, event: InboundEvent) {
  const db = useDb()
  // 自己發的（包含我們剛送出的回覆）不處理，否則會自己回自己
  const self = event.senderId === connection.externalId || event.senderId === connection.externalName || event.author === `@${connection.externalName}`
  if (!event.externalId || !event.text.trim()) return
  if (self) {
    // 但要記下來，對話串才看得到「我的回覆」（包含在平台 App 上自己打的）
    if (event.parentExternalId) await recordOwn(connection, { externalId: event.externalId, parentExternalId: event.parentExternalId, externalPostId: event.externalPostId, text: event.text })
    return
  }
  const [seen] = await db.select({ id: comments.id }).from(comments)
    .where(and(eq(comments.accountId, connection.accountId), eq(comments.externalId, event.externalId)))
  if (seen) return // Meta 會重送同一個事件

  let row: CommentRecord | undefined
  try {
    row = await processComment(boot, { accountId: connection.accountId, ...event })
  }
  catch (e) {
    // 兩個重送的事件同時進來時，後到的會撞到 (account_id, external_id) 的唯一索引
    if (/UNIQUE/i.test(String((e as Error)?.cause ?? e))) return
    throw e
  }
  await db.update(connections).set({ lastEventAt: nowIso() }).where(eq(connections.id, connection.id))
  // 貼文不在任何系列文裡時 row 是空的：不回覆、不留紀錄
  if (row?.status === 'ready' && connection.autoSend) await deliver(platform, connection, row)
}

/** 把 Meta webhook 的一個 entry 拆成留言與私訊事件。Instagram 與 Facebook 粉專的格式不同 */
export function eventsOf(platform: 'instagram' | 'facebook', entry: any): InboundEvent[] {
  const events: InboundEvent[] = []
  for (const change of entry?.changes ?? []) {
    const v = change?.value ?? {}
    if (platform === 'instagram' && change.field === 'comments') {
      // 回覆別人留言的留言會帶 parent_id
      events.push({ externalId: String(v.id ?? ''), senderId: String(v.from?.id ?? ''), author: v.from?.username ? `@${v.from.username}` : '（未知）', text: String(v.text ?? ''), externalPostId: String(v.media?.id ?? ''), parentExternalId: v.parent_id ? String(v.parent_id) : undefined, nested: Boolean(v.parent_id) })
    }
    // 粉專的 feed 事件什麼都有（貼文、按讚、編輯…），只收「新增留言」
    if (platform === 'facebook' && change.field === 'feed' && v.item === 'comment' && v.verb === 'add') {
      // 粉專的 parent_id：直接留在貼文底下的是貼文 id，回覆別人留言的是那則留言的 id
      const parent = v.parent_id && String(v.parent_id) !== String(v.post_id ?? '') ? String(v.parent_id) : undefined
      events.push({ externalId: String(v.comment_id ?? ''), senderId: String(v.from?.id ?? ''), author: String(v.from?.name ?? '（未知）'), text: String(v.message ?? ''), externalPostId: String(v.post_id ?? ''), parentExternalId: parent, nested: Boolean(parent) })
    }
  }
  // 私訊不處理：這個系統只做「留言 → 回覆留言＋私訊留言者」，不做私訊自動回覆（使用者的決定）
  return events
}
