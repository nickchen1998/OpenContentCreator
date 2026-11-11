import { and, eq } from 'drizzle-orm'
import { accounts, comments, connections } from '../database/schema'

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
    if (row.replyText) await replyToComment(platform, token, connection.externalId, row.externalId, row.replyText)
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

const messageOf = (e: unknown) => (e instanceof Error ? e.message : '送出失敗').slice(0, 300)

interface InboundEvent {
  externalId: string
  senderId: string
  author: string
  text: string
  externalPostId: string
}

/** 從 webhook（或 Threads 輪詢）收進一則留言或私訊：去重 → 跑規則 → 連結開著自動送出就直接回 */
export async function receive(boot: OwnedBoot, platform: MetaPlatform, connection: Connection, event: InboundEvent) {
  const db = useDb()
  // 自己發的（包含我們剛送出的回覆）不處理，否則會自己回自己
  const self = event.senderId === connection.externalId || event.senderId === connection.externalName
  if (!event.externalId || !event.text.trim() || self) return
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
      events.push({ externalId: String(v.id ?? ''), senderId: String(v.from?.id ?? ''), author: v.from?.username ? `@${v.from.username}` : '（未知）', text: String(v.text ?? ''), externalPostId: String(v.media?.id ?? '') })
    }
    // 粉專的 feed 事件什麼都有（貼文、按讚、編輯…），只收「新增留言」
    if (platform === 'facebook' && change.field === 'feed' && v.item === 'comment' && v.verb === 'add') {
      events.push({ externalId: String(v.comment_id ?? ''), senderId: String(v.from?.id ?? ''), author: String(v.from?.name ?? '（未知）'), text: String(v.message ?? ''), externalPostId: String(v.post_id ?? '') })
    }
  }
  // 私訊不處理：這個系統只做「留言 → 回覆留言＋私訊留言者」，不做私訊自動回覆（使用者的決定）
  return events
}
