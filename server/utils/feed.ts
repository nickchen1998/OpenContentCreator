import { and, desc, eq, inArray } from 'drizzle-orm'
import { accountPosts, accounts, collectionPosts, collections, comments } from '../database/schema'

/** 貼文管理頁：這個會員各帳號（Threads、Instagram、Facebook）已同步的貼文、所在的系列文、有幾串對話與其中幾串還在等回覆 */
export async function loadFeed(uid: number) {
  const db = useDb()
  const mine = and(eq(accounts.ownerId, uid), inArray(accounts.platform, ['threads', 'instagram', 'facebook']))
  const [posts, rows, series] = await db.batch([
    db.select({
      id: accountPosts.id, accountId: accountPosts.accountId, externalId: accountPosts.externalId, url: accountPosts.url, text: accountPosts.text,
      publishedAt: accountPosts.publishedAt, views: accountPosts.views, likes: accountPosts.likes, comments: accountPosts.comments,
      shares: accountPosts.shares, saves: accountPosts.saves, seriesId: collectionPosts.collectionId,
    }).from(accountPosts).innerJoin(accounts, eq(accounts.id, accountPosts.accountId))
      .leftJoin(collectionPosts, eq(collectionPosts.postId, accountPosts.id))
      .where(mine).orderBy(desc(accountPosts.publishedAt)).limit(400),
    // 只拿組對話需要的欄位，在這裡算每則貼文有幾串對話、幾串待回覆（「最後一句是誰說的」用 SQL 算不出來）
    db.select({
      id: comments.id, accountId: comments.accountId, externalId: comments.externalId, externalPostId: comments.externalPostId,
      parentExternalId: comments.parentExternalId, mine: comments.mine, status: comments.status, createdAt: comments.createdAt,
    }).from(comments).innerJoin(accounts, eq(accounts.id, comments.accountId)).where(mine).orderBy(desc(comments.id)).limit(4000),
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

/** 這則貼文是不是這個會員的；不是就當成不存在 */
export async function ownedFeedPost(uid: number, id: number) {
  const [row] = await useDb().select({
    id: accountPosts.id, accountId: accountPosts.accountId, externalId: accountPosts.externalId, text: accountPosts.text,
    seriesId: collectionPosts.collectionId, platform: accounts.platform,
  }).from(accountPosts)
    .innerJoin(accounts, eq(accounts.id, accountPosts.accountId))
    .leftJoin(collectionPosts, eq(collectionPosts.postId, accountPosts.id))
    .where(and(eq(accountPosts.id, id), eq(accounts.ownerId, uid)))
  if (!row || !isMetaPlatform(row.platform)) throw notFound('貼文')
  return { ...row, platform: row.platform as MetaPlatform }
}

/** 一則貼文底下記錄到的留言（新的在前） */
export const loadPostReplies = (post: { accountId: number, externalId: string }) =>
  useDb().select().from(comments).where(and(eq(comments.accountId, post.accountId), eq(comments.externalPostId, post.externalId)))
    .orderBy(desc(comments.createdAt), desc(comments.id)).limit(500)
