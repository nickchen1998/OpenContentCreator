import { and, desc, eq, sql } from 'drizzle-orm'
import { accounts, collections, comments } from '../../database/schema'

// 回覆輸入框上方的「常用回覆」：這串對話所屬系列文設定的回覆句，加上這個會員最常手動回的幾句。不另外做設定畫面
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const seriesId = Number(getQuery(event).seriesId)
  const db = useDb()
  const [recent, series] = await db.batch([
    db.select({ text: comments.text }).from(comments).innerJoin(accounts, eq(accounts.id, comments.accountId))
      .where(and(eq(accounts.ownerId, uid), eq(comments.mine, true), eq(comments.reason, '手動回覆')))
      .groupBy(comments.text).orderBy(desc(sql`count(*)`), desc(sql`max(${comments.id})`)).limit(6),
    db.select({ replies: collections.replies }).from(collections)
      .where(and(eq(collections.ownerId, uid), eq(collections.id, Number.isInteger(seriesId) ? seriesId : -1))),
  ])
  const all = [...(series[0]?.replies ?? []), ...recent.map(r => r.text)].map(t => t.trim()).filter(Boolean)
  return { replies: [...new Set(all)].slice(0, 5) }
})
