import { and, eq, gte, inArray, sql } from 'drizzle-orm'
import { accountPosts, collectionPosts, collections, comments } from '../database/schema'

export interface Incoming {
  accountId: number
  author: string
  text: string
  /** 平台上的留言 id、所在貼文的 id、留言者的 id */
  externalId: string
  externalPostId: string
  senderId: string
  /** 留言在平台上的時間。補抓舊留言時帶進來，紀錄才會排在正確的位置，也不會吃掉「每小時回覆上限」 */
  at?: string
  /** 回覆的是哪一則留言；直接回在貼文（或 Threads 子文）底下的不用帶 */
  parentExternalId?: string
  /** 對話裡的後續回覆（回覆別人的留言、回覆我們的回覆）：只記錄，不跑自動回覆，否則會跟人來回洗版 */
  nested?: boolean
}

/**
 * 留言回覆的引擎：回覆設定跟著「系列文」走。留言所在的貼文屬於某個系列文才會記錄，並依那個系列的設定回覆
 * （回覆留言與私訊各自有填才做，兩個都沒填就只記錄）；不在任何系列裡的貼文完全不處理、也不留紀錄，
 * 只有 Threads 例外：全部都記錄（不回），給串文管理頁用。
 * 防洗版：同一個人在同一則貼文只回一次；每個帳號每小時回覆有上限；多句輪替。
 * 這裡只負責「選好回覆」（status ready）並記錄下來，實際送出在 server/utils/inbound.ts 的 deliver。
 */
export async function processComment(boot: OwnedBoot, input: Incoming) {
  const db = useDb()
  const account = boot.accounts.find(a => a.id === input.accountId)
  if (!account || !input.externalPostId) return
  const answered = inArray(comments.status, ['ready', 'sent'])
  const hourAgo = new Date(Date.now() - 3600_000).toISOString()
  const [found, earlier, recent] = await db.batch([
    db.select({ series: collections, postText: accountPosts.text }).from(accountPosts)
      .leftJoin(collectionPosts, eq(collectionPosts.postId, accountPosts.id))
      .leftJoin(collections, and(eq(collections.id, collectionPosts.collectionId), eq(collections.ownerId, boot.ownerId)))
      .where(and(eq(accountPosts.accountId, input.accountId), eq(accountPosts.externalId, input.externalPostId))),
    // 這個人在這則貼文之前已經被回過的紀錄
    db.select({ id: comments.id }).from(comments).where(and(
      eq(comments.accountId, input.accountId), eq(comments.senderId, input.senderId), eq(comments.externalPostId, input.externalPostId), answered,
    )).limit(1),
    db.select({ n: sql<number>`count(*)` }).from(comments).where(and(eq(comments.accountId, input.accountId), answered, gte(comments.createdAt, hourAgo))),
  ])
  const series = found[0]?.series
  const record = {
    accountId: input.accountId, kind: 'comment', postTitle: found[0]?.postText ?? '',
    author: input.author, text: input.text, createdAt: input.at ?? nowIso(),
    externalId: input.externalId, externalPostId: input.externalPostId, senderId: input.senderId, parentExternalId: input.parentExternalId ?? '',
  }
  if (!series) {
    // 貼文不在任何系列文裡：Threads 照樣記下來（串文管理頁要看得到、由會員手動回），其他平台不處理也不記錄
    if (account.platform !== 'threads') return
    return insert({ ...record, status: 'unmatched', reason: input.nested ? '對話中的回覆' : '未歸入系列文' })
  }
  if (input.nested) return insert({ ...record, collectionId: series.id, ruleName: series.name, status: 'unmatched', reason: '對話中的回覆' })

  const base = {
    accountId: input.accountId, collectionId: series.id, ruleName: series.name, kind: 'comment', postTitle: found[0]!.postText,
    author: input.author, text: input.text, createdAt: input.at ?? nowIso(),
    externalId: input.externalId, externalPostId: input.externalPostId, senderId: input.senderId, parentExternalId: input.parentExternalId ?? '',
  }
  // 留言後私訊只有 Instagram 與 Facebook 做得到；系列裡其他平台的貼文只回留言
  const withDm = Boolean(series.dmText) && (account.platform === 'instagram' || account.platform === 'facebook')
  const withReply = series.replies.length > 0
  // 回覆與私訊都沒填的系列文：留言照樣記下來（留言紀錄看得到），只是不動作
  if (!withReply && !withDm) return insert({ ...base, status: 'unmatched', reason: series.dmText ? '這個平台不能私訊留言者' : '這個系列文沒有設定回覆' })
  const text = input.text.toLowerCase()
  const keyword = series.matchType === 'any' ? '' : keywordsOf(series.keywords).find(k => text.includes(k.toLowerCase()))
  if (series.matchType !== 'any' && !keyword) {
    return insert({ ...base, status: 'unmatched', reason: '留言沒有包含關鍵字' })
  }
  if (earlier.length) return insert({ ...base, status: 'skipped', reason: '這個人在這則貼文已經回過' })
  if (boot.rules.replyPerHour > 0 && (recent[0]?.n ?? 0) >= boot.rules.replyPerHour) {
    return insert({ ...base, status: 'skipped', reason: `這個帳號這一小時已達上限 ${boot.rules.replyPerHour} 則` })
  }
  const index = withReply ? series.cursor % series.replies.length : 0
  const [, created] = await db.batch([
    db.update(collections).set({ cursor: series.cursor + (withReply ? 1 : 0) }).where(eq(collections.id, series.id)),
    db.insert(comments).values({
      ...base,
      status: 'ready',
      replyText: withReply ? series.replies[index]! : '',
      dmText: withDm ? series.dmText : '',
      reason: `${keyword ? `關鍵字「${keyword}」` : '任何留言'}，${[withReply ? `第 ${index + 1} 句` : '', withDm ? '私訊' : ''].filter(Boolean).join('＋')}`,
    }).returning(),
  ])
  return created[0]!
}

export const keywordsOf = (keywords: string) => keywords.split(/[,，、\n]/).map(k => k.trim()).filter(Boolean)

async function insert(values: typeof comments.$inferInsert) {
  const [row] = await useDb().insert(comments).values(values).returning()
  return row!
}
