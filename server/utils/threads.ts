import { and, desc, eq } from 'drizzle-orm'
import { accountPosts, accounts, collectionPosts, collections, comments } from '../database/schema'

/** 串文管理頁：這個會員所有 Threads 帳號已同步的貼文、所在的系列文、有幾串對話與其中幾串還在等回覆 */
export async function loadThreads(uid: number) {
  const db = useDb()
  const mine = and(eq(accounts.ownerId, uid), eq(accounts.platform, 'threads'))
  const [posts, rows, series] = await db.batch([
    db.select({
      id: accountPosts.id, accountId: accountPosts.accountId, externalId: accountPosts.externalId, url: accountPosts.url, text: accountPosts.text,
      publishedAt: accountPosts.publishedAt, views: accountPosts.views, likes: accountPosts.likes, comments: accountPosts.comments,
      shares: accountPosts.shares, saves: accountPosts.saves, seriesId: collectionPosts.collectionId,
    }).from(accountPosts).innerJoin(accounts, eq(accounts.id, accountPosts.accountId))
      .leftJoin(collectionPosts, eq(collectionPosts.postId, accountPosts.id))
      .where(mine).orderBy(desc(accountPosts.publishedAt)).limit(300),
    // 只拿組對話需要的欄位，在這裡算每則貼文有幾串對話、幾串待回覆（「最後一句是誰說的」用 SQL 算不出來）
    db.select({
      id: comments.id, accountId: comments.accountId, externalId: comments.externalId, externalPostId: comments.externalPostId,
      parentExternalId: comments.parentExternalId, mine: comments.mine, status: comments.status, createdAt: comments.createdAt,
    }).from(comments).innerJoin(accounts, eq(accounts.id, comments.accountId)).where(mine).orderBy(desc(comments.id)).limit(3000),
    db.select({ id: collections.id, name: collections.name }).from(collections).where(eq(collections.ownerId, uid)).orderBy(collections.id),
  ])
  const grouped = groupConversations(rows)
  const countOf = new Map<string, { received: number, pending: number }>()
  for (const c of grouped.conversations) {
    const key = `${c.root.accountId}:${c.root.externalPostId}`
    const n = countOf.get(key) ?? { received: 0, pending: 0 }
    n.received += 1
    if (c.waiting) n.pending += 1
    countOf.set(key, n)
  }
  return {
    posts: posts.map(({ externalId, ...p }) => {
      const key = `${p.accountId}:${externalId}`
      return { ...p, received: countOf.get(key)?.received ?? 0, pending: countOf.get(key)?.pending ?? 0, parts: grouped.parts.get(key)?.length ?? 0 }
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
    .orderBy(desc(comments.createdAt), desc(comments.id)).limit(500)
