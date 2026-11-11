import { eq, sql } from 'drizzle-orm'
import { accounts, comments, connections } from '../database/schema'

// 頁面每 30 秒問一次「我的資料有沒有變」。回傳一個指紋，跟上次不一樣頁面才重新載入。
// 只做一趟很輕的查詢：留言紀錄的筆數、最新一筆、各種狀態的數量（回覆、標成不用回、送出失敗都會讓它變），加上最近一次同步的時間
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const db = useDb()
  const [talk, sync] = await db.batch([
    db.select({
      n: sql<number>`count(*)`,
      last: sql<number>`coalesce(max(${comments.id}), 0)`,
      sent: sql<number>`coalesce(sum(case when ${comments.status} = 'sent' then 1 else 0 end), 0)`,
      handled: sql<number>`coalesce(sum(case when ${comments.status} = 'handled' then 1 else 0 end), 0)`,
      ready: sql<number>`coalesce(sum(case when ${comments.status} = 'ready' then 1 else 0 end), 0)`,
      failed: sql<number>`coalesce(sum(case when ${comments.error} != '' then 1 else 0 end), 0)`,
    }).from(comments).innerJoin(accounts, eq(accounts.id, comments.accountId)).where(eq(accounts.ownerId, uid)),
    db.select({ synced: sql<string>`coalesce(max(${connections.lastSyncedAt}), '')`, errors: sql<number>`coalesce(sum(case when ${connections.lastError} != '' then 1 else 0 end), 0)` })
      .from(connections).innerJoin(accounts, eq(accounts.id, connections.accountId)).where(eq(accounts.ownerId, uid)),
  ])
  const t = talk[0]!
  return { stamp: [t.n, t.last, t.sent, t.handled, t.ready, t.failed, sync[0]?.synced ?? '', sync[0]?.errors ?? 0].join(':') }
})
