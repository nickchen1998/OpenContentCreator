import { and, asc, eq } from 'drizzle-orm'
import { accountPosts, accounts, collectionPosts, collections } from '../database/schema'

/** 這個會員的所有系列，連同裡面的貼文與成效（不受期間篩選影響：系列是固定的一組貼文） */
export async function loadCollections(uid: number) {
  const db = useDb()
  const [list, members] = await db.batch([
    db.select({ id: collections.id, name: collections.name }).from(collections).where(eq(collections.ownerId, uid)).orderBy(asc(collections.id)),
    db.select({
      collectionId: collectionPosts.collectionId,
      id: accountPosts.id, accountId: accountPosts.accountId, url: accountPosts.url, text: accountPosts.text, publishedAt: accountPosts.publishedAt,
      views: accountPosts.views, likes: accountPosts.likes, comments: accountPosts.comments, shares: accountPosts.shares, saves: accountPosts.saves,
    }).from(collectionPosts)
      .innerJoin(collections, eq(collections.id, collectionPosts.collectionId))
      .innerJoin(accountPosts, eq(accountPosts.id, collectionPosts.postId))
      .where(eq(collections.ownerId, uid)),
  ])
  return list.map(c => ({ ...c, posts: members.filter(m => m.collectionId === c.id).map(({ collectionId: _, ...p }) => p) }))
}

export async function ownedCollection(uid: number, id: number) {
  const [row] = await useDb().select({ id: collections.id }).from(collections).where(and(eq(collections.id, id), eq(collections.ownerId, uid)))
  if (!row) throw notFound('系列')
}

/** 只留下真的屬於這個會員的貼文 id（別人的貼文 id 直接丟掉） */
export async function ownedPostIds(uid: number, value: unknown) {
  if (!Array.isArray(value) || !value.length) return []
  const ids = [...new Set(value.map(Number))].filter(n => Number.isInteger(n) && n > 0).slice(0, 200)
  if (!ids.length) return []
  const rows = await useDb().select({ id: accountPosts.id }).from(accountPosts)
    .innerJoin(accounts, eq(accounts.id, accountPosts.accountId))
    .where(and(eq(accounts.ownerId, uid), inIdList(accountPosts.id, ids)))
  return rows.map(r => r.id)
}

/** 把貼文加進系列（已經在裡面的略過）。每個 statement 最多 100 個參數，一列兩個，所以 40 筆一批 */
export function addToCollection(collectionId: number, postIds: number[]) {
  const statements = []
  for (let i = 0; i < postIds.length; i += 40) {
    statements.push(useDb().insert(collectionPosts).values(postIds.slice(i, i + 40).map(postId => ({ collectionId, postId }))).onConflictDoNothing())
  }
  return batchWrites(statements)
}
