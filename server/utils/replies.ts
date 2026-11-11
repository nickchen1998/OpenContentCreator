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
}

/**
 * 留言回覆的引擎：回覆設定跟著「系列文」走。留言所在的貼文屬於某個啟用中的系列文，才會依那個系列的設定回覆；
 * 不在任何系列裡的貼文完全不處理、也不留紀錄。
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
      .innerJoin(collectionPosts, eq(collectionPosts.postId, accountPosts.id))
      .innerJoin(collections, eq(collections.id, collectionPosts.collectionId))
      .where(and(eq(accountPosts.accountId, input.accountId), eq(accountPosts.externalId, input.externalPostId), eq(collections.ownerId, boot.ownerId))),
    // 這個人在這則貼文之前已經被回過的紀錄
    db.select({ id: comments.id }).from(comments).where(and(
      eq(comments.accountId, input.accountId), eq(comments.senderId, input.senderId), eq(comments.externalPostId, input.externalPostId), answered,
    )).limit(1),
    db.select({ n: sql<number>`count(*)` }).from(comments).where(and(eq(comments.accountId, input.accountId), answered, gte(comments.createdAt, hourAgo))),
  ])
  const series = found[0]?.series
  // 暫停中的系列文、沒有設定回覆內容的系列文：不回覆，也不記錄
  if (!series || !series.enabled || !series.replies.length) return

  const base = {
    accountId: input.accountId, collectionId: series.id, ruleName: series.name, kind: 'comment', postTitle: found[0]!.postText,
    author: input.author, text: input.text, createdAt: nowIso(),
    externalId: input.externalId, externalPostId: input.externalPostId, senderId: input.senderId,
  }
  const text = input.text.toLowerCase()
  const keyword = series.matchType === 'any' ? '' : keywordsOf(series.keywords).find(k => text.includes(k.toLowerCase()))
  if (series.matchType !== 'any' && !keyword) {
    return insert({ ...base, status: 'unmatched', reason: '留言沒有包含關鍵字' })
  }
  if (earlier.length) return insert({ ...base, status: 'skipped', reason: '這個人在這則貼文已經回過' })
  if (boot.rules.replyPerHour > 0 && (recent[0]?.n ?? 0) >= boot.rules.replyPerHour) {
    return insert({ ...base, status: 'skipped', reason: `這個帳號這一小時已達上限 ${boot.rules.replyPerHour} 則` })
  }
  const index = series.cursor % series.replies.length
  // 留言後私訊只有 Instagram 與 Facebook 做得到；系列裡其他平台的貼文只回留言
  const withDm = Boolean(series.dmText) && (account.platform === 'instagram' || account.platform === 'facebook')
  const [, created] = await db.batch([
    db.update(collections).set({ cursor: series.cursor + 1 }).where(eq(collections.id, series.id)),
    db.insert(comments).values({
      ...base,
      status: 'ready',
      replyText: series.replies[index]!,
      dmText: withDm ? series.dmText : '',
      reason: `${keyword ? `關鍵字「${keyword}」` : '任何留言'}，第 ${index + 1} 句${withDm ? '＋私訊' : ''}`,
    }).returning(),
  ])
  return created[0]!
}

export const keywordsOf = (keywords: string) => keywords.split(/[,，、\n]/).map(k => k.trim()).filter(Boolean)

async function insert(values: typeof comments.$inferInsert) {
  const [row] = await useDb().insert(comments).values(values).returning()
  return row!
}
