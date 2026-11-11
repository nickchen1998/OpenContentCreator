import { and, desc, eq, gte } from 'drizzle-orm'
import { accounts, accountStats, connections } from '../database/schema'

type Connection = typeof connections.$inferSelect

/**
 * 帳號目前的粉絲數（YouTube 是訂閱數），每個平台 1 個請求。拿不到（頻道隱藏訂閱數、權限不夠）回 null。
 * YouTube 的訂閱數 API 只給三位有效數字。
 */
export async function fetchFollowers(platform: LinkedPlatform, token: string, selfId: string): Promise<number | null> {
  const count = (v: unknown) => (v != null && Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : null)
  if (platform === 'youtube') return youtubeSubscribers(token, selfId)
  if (platform === 'threads') {
    const data = await metaGet(platform, token, `/${selfId}/threads_insights`, { metric: 'followers_count' })
    return count(data?.data?.[0]?.total_value?.value)
  }
  const data = await metaGet(platform, token, `/${selfId}`, { fields: platform === 'instagram' ? 'followers_count' : 'followers_count,fan_count' })
  return count(data?.followers_count ?? data?.fan_count)
}

/**
 * 今天還沒記過就抓一次並記下來（一個帳號一天只打一次平台）。抓不到不算錯，也不影響同步的其他部分。
 */
export async function recordFollowers(platform: LinkedPlatform, connection: Connection, token: string) {
  const db = useDb()
  const day = todayTaipei()
  const [seen] = await db.select({ day: accountStats.day }).from(accountStats)
    .where(and(eq(accountStats.accountId, connection.accountId), eq(accountStats.day, day)))
  if (seen) return
  const followers = await fetchFollowers(platform, token, connection.externalId).catch(() => null)
  if (followers == null) return
  await db.insert(accountStats).values({ accountId: connection.accountId, day, followers })
    .onConflictDoUpdate({ target: [accountStats.accountId, accountStats.day], set: { followers } })
}

/**
 * 儀表板用：這個會員各帳號目前的粉絲數，以及跟「期間開始那天」相比的增減。
 * 增減只在期間開始那天（或更早）有紀錄時才算；紀錄還不夠久就是 null，不亂猜。
 */
export async function loadFollowers(uid: number, days: number) {
  const since = addDays(todayTaipei(), -Math.max(days, 1) - 7)
  const rows = await useDb().select({ accountId: accountStats.accountId, day: accountStats.day, followers: accountStats.followers })
    .from(accountStats).innerJoin(accounts, eq(accounts.id, accountStats.accountId))
    .where(and(eq(accounts.ownerId, uid), gte(accountStats.day, since))).orderBy(desc(accountStats.day))
  const start = addDays(todayTaipei(), -days)
  const out: Record<number, { followers: number, change: number | null }> = {}
  for (const id of new Set(rows.map(r => r.accountId))) {
    const mine = rows.filter(r => r.accountId === id)
    const base = mine.find(r => r.day <= start)
    out[id] = { followers: mine[0]!.followers, change: base ? mine[0]!.followers - base.followers : null }
  }
  return out
}
