import { and, asc, desc, eq, gte, sql } from 'drizzle-orm'
import { accountPosts, accounts, collectionPosts, collections, comments } from '../database/schema'

const postColumns = {
  id: accountPosts.id, accountId: accountPosts.accountId, url: accountPosts.url, text: accountPosts.text, publishedAt: accountPosts.publishedAt,
  views: accountPosts.views, likes: accountPosts.likes, comments: accountPosts.comments, shares: accountPosts.shares, saves: accountPosts.saves,
}

/** 這個會員的所有系列文：設定、裡面的貼文與成效（貼文的累計數字）、留言與私訊的次數 */
export async function loadSeries(uid: number): Promise<Series[]> {
  const db = useDb()
  const [list, members, counts] = await db.batch([
    db.select().from(collections).where(eq(collections.ownerId, uid)).orderBy(asc(collections.id)),
    db.select({ collectionId: collectionPosts.collectionId, ...postColumns }).from(collectionPosts)
      .innerJoin(collections, eq(collections.id, collectionPosts.collectionId))
      .innerJoin(accountPosts, eq(accountPosts.id, collectionPosts.postId))
      .where(eq(collections.ownerId, uid)).orderBy(desc(accountPosts.publishedAt)),
    db.select({
      collectionId: comments.collectionId,
      received: sql<number>`count(*)`,
      replied: sql<number>`sum(case when ${comments.status} = 'sent' then 1 else 0 end)`,
      // 私訊失敗時 error 會寫「留言已回覆，但私訊失敗」，那種不算送出
      dms: sql<number>`sum(case when ${comments.status} = 'sent' and ${comments.dmText} != '' and ${comments.error} = '' then 1 else 0 end)`,
    }).from(comments).innerJoin(collections, eq(collections.id, comments.collectionId)).where(eq(collections.ownerId, uid)).groupBy(comments.collectionId),
  ])
  return list.map(({ ownerId: _, cursor: __, createdAt: ___, ...c }) => {
    const n = counts.find(x => x.collectionId === c.id)
    return {
      ...c,
      matchType: c.matchType === 'keyword' ? 'keyword' : 'any',
      posts: members.filter(m => m.collectionId === c.id).map(({ collectionId: _c, ...p }) => p),
      received: n?.received ?? 0,
      replied: n?.replied ?? 0,
      dms: n?.dms ?? 0,
    }
  })
}

export async function ownedSeries(uid: number, id: number) {
  const [row] = await useDb().select({ id: collections.id }).from(collections).where(and(eq(collections.id, id), eq(collections.ownerId, uid)))
  if (!row) throw notFound('系列文')
}

/** 可以放進系列文的貼文：這個會員各帳號已同步的貼文，附上它目前在哪個系列文裡 */
export async function loadCandidates(uid: number) {
  return useDb().select({ ...postColumns, seriesId: collectionPosts.collectionId, seriesName: collections.name }).from(accountPosts)
    .innerJoin(accounts, eq(accounts.id, accountPosts.accountId))
    .leftJoin(collectionPosts, eq(collectionPosts.postId, accountPosts.id))
    .leftJoin(collections, eq(collections.id, collectionPosts.collectionId))
    .where(eq(accounts.ownerId, uid)).orderBy(desc(accountPosts.publishedAt)).limit(300)
}

/** 驗證並整理系列文的設定 */
export function seriesValues(body: Record<string, unknown>) {
  const matchType = body.matchType === 'keyword' ? 'keyword' : 'any'
  const replies = (Array.isArray(body.replies) ? body.replies : []).map(r => str(r, '回覆內容', 500, false)).filter(Boolean)
  if (replies.length > 20) throw bad('回覆最多 20 句')
  const dmText = str(body.dmText, '私訊內容', 1000, false)
  if (dmText && !replies.length) throw bad('要私訊留言者的話，也要寫至少一句公開回覆')
  return {
    name: str(body.name, '系列文名稱', 40),
    matchType,
    keywords: str(body.keywords, '關鍵字', 200, matchType === 'keyword' && replies.length > 0),
    replies,
    dmText,
    enabled: body.enabled !== false,
  }
}

/**
 * 把系列文的貼文換成 postIds 這一組。只收這個會員自己的貼文；已經在別的系列文裡的不能再放（一則貼文只能屬於一個系列文）。
 */
export async function setSeriesPosts(uid: number, seriesId: number, value: unknown) {
  const db = useDb()
  const ids = Array.isArray(value) ? [...new Set(value.map(Number))].filter(n => Number.isInteger(n) && n > 0).slice(0, 200) : []
  const rows = ids.length
    ? await db.select({ id: accountPosts.id, text: accountPosts.text, seriesId: collectionPosts.collectionId, seriesName: collections.name }).from(accountPosts)
        .innerJoin(accounts, eq(accounts.id, accountPosts.accountId))
        .leftJoin(collectionPosts, eq(collectionPosts.postId, accountPosts.id))
        .leftJoin(collections, eq(collections.id, collectionPosts.collectionId))
        .where(and(eq(accounts.ownerId, uid), inIdList(accountPosts.id, ids)))
    : []
  const taken = rows.find(r => r.seriesId != null && r.seriesId !== seriesId)
  if (taken) throw bad(`「${taken.text || '這則貼文'}」已經在系列文「${taken.seriesName}」裡，一則貼文只能屬於一個系列文`)
  const keep = rows.map(r => r.id)
  const statements = [db.delete(collectionPosts).where(eq(collectionPosts.collectionId, seriesId))]
  // 每個 statement 最多 100 個參數，一列兩個
  for (let i = 0; i < keep.length; i += 40) {
    statements.push(db.insert(collectionPosts).values(keep.slice(i, i + 40).map(postId => ({ collectionId: seriesId, postId }))) as any)
  }
  await batchWrites(statements)
}

/** 系列文的留言紀錄（新的在前） */
export function loadSeriesComments(seriesId: number) {
  return useDb().select().from(comments).where(eq(comments.collectionId, seriesId)).orderBy(desc(comments.createdAt), desc(comments.id)).limit(200)
}

/** 儀表板用：期間內自動回覆與私訊送出的次數 */
export async function replyTotals(uid: number, days: number) {
  const since = new Date(Date.now() - days * 86400_000).toISOString()
  const [row] = await useDb().select({
    replied: sql<number>`sum(case when ${comments.status} = 'sent' then 1 else 0 end)`,
    dms: sql<number>`sum(case when ${comments.status} = 'sent' and ${comments.dmText} != '' and ${comments.error} = '' then 1 else 0 end)`,
  }).from(comments).innerJoin(accounts, eq(accounts.id, comments.accountId)).where(and(eq(accounts.ownerId, uid), gte(comments.createdAt, since)))
  return { replied: row?.replied ?? 0, dms: row?.dms ?? 0 }
}
