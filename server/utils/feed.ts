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

/**
 * 儀表板最上面「今天要處理」用的數字：有幾串對話在等回覆、等最久的是什麼時候、有幾則送出失敗，以及各系列文各有幾串在等。
 * 「最後一句是誰說的」用 SQL 算不出來，所以拿組對話需要的欄位回來在這裡算。
 */
export async function loadTodo(uid: number) {
  const db = useDb()
  const [rows, names] = await db.batch([
    db.select({
      id: comments.id, accountId: comments.accountId, externalId: comments.externalId, externalPostId: comments.externalPostId,
      parentExternalId: comments.parentExternalId, mine: comments.mine, status: comments.status, createdAt: comments.createdAt,
      collectionId: comments.collectionId, error: comments.error,
    }).from(comments).innerJoin(accounts, eq(accounts.id, comments.accountId)).where(eq(accounts.ownerId, uid)).orderBy(desc(comments.id)).limit(4000),
    db.select({ id: collections.id, name: collections.name }).from(collections).where(eq(collections.ownerId, uid)),
  ])
  const waiting = groupConversations(rows).conversations.filter(c => c.waiting)
  const bySeries: Record<number, number> = {}
  for (const c of waiting) if (c.root.collectionId != null) bySeries[c.root.collectionId] = (bySeries[c.root.collectionId] ?? 0) + 1
  const failed = rows.filter(r => r.status === 'ready' && r.error)
  return {
    waiting: waiting.length,
    oldestWaitAt: waiting.map(c => c.last.createdAt).sort()[0] ?? null,
    failed: failed.length,
    failedIn: names.find(n => n.id === failed[0]?.collectionId)?.name ?? '',
    failedSeriesId: failed[0]?.collectionId ?? null,
    bySeries,
  }
}
