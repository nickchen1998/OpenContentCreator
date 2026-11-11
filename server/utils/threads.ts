import { and, desc, eq, sql } from 'drizzle-orm'
import { accountPosts, accounts, collectionPosts, collections, comments } from '../database/schema'

// 還沒回的回覆：沒命中（或未歸入系列文）、被略過、選好回覆但還沒送出
const pending = sql<number>`sum(case when ${comments.status} in ('unmatched', 'skipped', 'ready') then 1 else 0 end)`

/** 串文管理頁：這個會員所有 Threads 帳號已同步的貼文、所在的系列文、收到幾則回覆與還沒回的有幾則 */
export async function loadThreads(uid: number) {
  const db = useDb()
  const mine = and(eq(accounts.ownerId, uid), eq(accounts.platform, 'threads'))
  const [posts, counts, series] = await db.batch([
    db.select({
      id: accountPosts.id, accountId: accountPosts.accountId, externalId: accountPosts.externalId, url: accountPosts.url, text: accountPosts.text,
      publishedAt: accountPosts.publishedAt, views: accountPosts.views, likes: accountPosts.likes, comments: accountPosts.comments,
      shares: accountPosts.shares, saves: accountPosts.saves, seriesId: collectionPosts.collectionId,
    }).from(accountPosts).innerJoin(accounts, eq(accounts.id, accountPosts.accountId))
      .leftJoin(collectionPosts, eq(collectionPosts.postId, accountPosts.id))
      .where(mine).orderBy(desc(accountPosts.publishedAt)).limit(300),
    db.select({ accountId: comments.accountId, externalPostId: comments.externalPostId, received: sql<number>`count(*)`, pending })
      .from(comments).innerJoin(accounts, eq(accounts.id, comments.accountId))
      .where(mine).groupBy(comments.accountId, comments.externalPostId),
    db.select({ id: collections.id, name: collections.name }).from(collections).where(eq(collections.ownerId, uid)).orderBy(collections.id),
  ])
  const countOf = new Map(counts.map(c => [`${c.accountId}:${c.externalPostId}`, c]))
  return {
    posts: posts.map(({ externalId, ...p }) => {
      const c = countOf.get(`${p.accountId}:${externalId}`)
      return { ...p, received: c?.received ?? 0, pending: c?.pending ?? 0 }
    }),
    series,
  }
}

/** 這則 Threads 貼文是不是這個會員的；不是就當成不存在 */
export async function ownedThread(uid: number, id: number) {
  const [row] = await useDb().select({ id: accountPosts.id, accountId: accountPosts.accountId, externalId: accountPosts.externalId }).from(accountPosts)
    .innerJoin(accounts, eq(accounts.id, accountPosts.accountId))
    .where(and(eq(accountPosts.id, id), eq(accounts.ownerId, uid), eq(accounts.platform, 'threads')))
  if (!row) throw notFound('貼文')
  return row
}

/** 一則貼文底下記錄到的回覆（新的在前） */
export const loadThreadReplies = (thread: { accountId: number, externalId: string }) =>
  useDb().select().from(comments).where(and(eq(comments.accountId, thread.accountId), eq(comments.externalPostId, thread.externalId)))
    .orderBy(desc(comments.createdAt), desc(comments.id)).limit(200)
