import type { H3Event } from 'h3'
import { and, desc, eq, gte } from 'drizzle-orm'
import { accountPosts, accounts, collectionPosts, connections } from '../database/schema'

/** 這個會員各帳號近 N 天的貼文與成效（自動匯入的），以及各帳號的同步狀態 */
/** 儀表板的平台篩選（?platform=）：不是已知的平台就當作沒篩 */
export function queryPlatform(event: H3Event): Platform | undefined {
  const value = getQuery(event).platform
  return isPlatform(value) ? value : undefined
}

export async function loadInsights(uid: number, days: number) {
  const db = useDb()
  const since = new Date(Date.now() - days * 86400_000).toISOString()
  const [posts, status] = await db.batch([
    db.select({
      id: accountPosts.id, accountId: accountPosts.accountId, url: accountPosts.url, text: accountPosts.text, publishedAt: accountPosts.publishedAt,
      views: accountPosts.views, likes: accountPosts.likes, comments: accountPosts.comments, shares: accountPosts.shares, saves: accountPosts.saves,
      seriesId: collectionPosts.collectionId,
    }).from(accountPosts).innerJoin(accounts, eq(accounts.id, accountPosts.accountId))
      .leftJoin(collectionPosts, eq(collectionPosts.postId, accountPosts.id))
      .where(and(eq(accounts.ownerId, uid), gte(accountPosts.publishedAt, since))).orderBy(desc(accountPosts.publishedAt)).limit(1000),
    db.select({ accountId: connections.accountId, lastSyncedAt: connections.lastSyncedAt, lastError: connections.lastError, tokenExpiresAt: connections.tokenExpiresAt })
      .from(connections).innerJoin(accounts, eq(accounts.id, connections.accountId))
      .where(eq(accounts.ownerId, uid)),
  ])
  return { posts, status }
}
