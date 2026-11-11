import { and, asc, desc, eq, gte, lte } from 'drizzle-orm'
import { accountPosts, accounts, accountStats, connections } from '../database/schema'

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
    const metric = (data?.data ?? []).find((m: any) => m?.name === 'followers_count') ?? data?.data?.[0]
    // 文件說是 total_value；有些回應把數字放在 values 裡，兩種都接
    return count(metric?.total_value?.value ?? metric?.values?.at?.(-1)?.value)
  }
  const data = await metaGet(platform, token, `/${selfId}`, { fields: platform === 'instagram' ? 'followers_count' : 'followers_count,fan_count' })
  return count(data?.followers_count ?? data?.fan_count)
}

/**
 * 今天還沒記過就抓一次並記下來（一個帳號一天只打一次平台）。不影響同步的其他部分；
 * 抓不到時回傳原因（會顯示在同步結果與連結狀態上，不然只會看到一欄空白、不知道為什麼）。
 */
export async function recordFollowers(platform: LinkedPlatform, connection: Connection, token: string) {
  const db = useDb()
  const day = todayTaipei()
  const [seen] = await db.select({ day: accountStats.day }).from(accountStats)
    .where(and(eq(accountStats.accountId, connection.accountId), eq(accountStats.day, day)))
  if (seen) return ''
  const followers = await fetchFollowers(platform, token, connection.externalId)
  if (followers == null) return platform === 'youtube' ? '讀不到訂閱數：頻道把訂閱人數設成隱藏' : '讀不到粉絲數：平台沒有回傳數字'
  await db.insert(accountStats).values({ accountId: connection.accountId, day, followers })
    .onConflictDoUpdate({ target: [accountStats.accountId, accountStats.day], set: { followers } })
  return ''
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

/**
 * 粉絲成長分析要的原始資料：這個帳號全部的每日粉絲紀錄（由舊到新）與指定日期（台北）範圍內發的貼文。兩個查詢。
 * **accountId 要先確認是這個會員的**（`ownedAccount` 或 `loadBoot` 裡找得到）再呼叫。
 */
async function loadGrowthData(accountId: number, postsFrom: string | null, postsTo: string | null) {
  const db = useDb()
  // 台北的一天從 UTC 的前一天 16:00 開始
  const startOf = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - 8 * 3600_000).toISOString()
  const [stats, posts] = await Promise.all([
    db.select({ day: accountStats.day, followers: accountStats.followers }).from(accountStats)
      .where(eq(accountStats.accountId, accountId)).orderBy(asc(accountStats.day)).limit(3000),
    postsFrom == null
      ? Promise.resolve([])
      : db.select({ publishedAt: accountPosts.publishedAt, text: accountPosts.text, url: accountPosts.url, views: accountPosts.views, likes: accountPosts.likes, comments: accountPosts.comments, shares: accountPosts.shares })
          .from(accountPosts).where(and(eq(accountPosts.accountId, accountId), gte(accountPosts.publishedAt, startOf(postsFrom)), ...(postsTo ? [lte(accountPosts.publishedAt, startOf(addDays(postsTo, 1)))] : [])))
          .orderBy(desc(accountPosts.publishedAt)).limit(2000),
  ])
  return { stats, posts }
}

/** 每成長 step 個粉絲花了幾天（算法在 shared/utils/growth.ts）。 */
export async function loadFollowerGrowth(accountId: number, step: number) {
  const db = useDb()
  const [first] = await db.select({ day: accountStats.day }).from(accountStats).where(eq(accountStats.accountId, accountId)).orderBy(asc(accountStats.day)).limit(1)
  const { stats, posts } = await loadGrowthData(accountId, first?.day ?? null, null)
  return followerGrowth(stats, posts, step, todayTaipei())
}

/** 幾段自訂期間各自的粉絲增減與貼文，用來互相比較（例如去年十月跟今年十月）。 */
export async function loadFollowerPeriods(accountId: number, periods: { from: string, to: string }[]) {
  const from = periods.map(p => p.from).sort()[0]!
  const to = periods.map(p => p.to).sort().at(-1)!
  const { stats, posts } = await loadGrowthData(accountId, from, to)
  return periods.map(p => periodSummary(stats, posts, p.from, p.to))
}

/** 檢查並整理期間：日期格式、先後順序、最長 366 天、最多 4 段。網頁與 MCP 共用。 */
export function parsePeriods(value: unknown) {
  if (!Array.isArray(value) || !value.length || value.length > 4) throw bad('期間要 1 到 4 段')
  return value.map((item) => {
    const { from, to } = (item ?? {}) as { from?: unknown, to?: unknown }
    if (typeof from !== 'string' || typeof to !== 'string' || !DAY_RE.test(from) || !DAY_RE.test(to) || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) throw bad('日期格式要是 YYYY-MM-DD')
    if (to < from) throw bad('結束日期不能比開始日期早')
    if (dayDiff(from, to) > 365) throw bad('一段期間最長 366 天')
    return { from, to }
  })
}
