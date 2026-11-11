// 粉絲成長分析：只呈現資料，不做原因分析。網頁（GrowthDialog）、API 與 MCP 工具共用。
// 粉絲數來自每天一筆的紀錄（account_stats），所以精度是「天」，而且只能從開始記錄那天算起；
// 沒有紀錄的日子不內插——里程碑算在之後第一個有紀錄、而且數字達標的那天。

export interface FollowerDay { day: string, followers: number }
export interface GrowthSourcePost { publishedAt: string, text: string, url: string, views: number, likes: number, comments: number, shares: number }
export interface GrowthPost { published: string, text: string, url: string, views: number, engagement: number }
export interface GrowthInterval {
  from: number
  to: number
  started: string
  reached: string
  days: number
  /** 紀錄是從這個區間的半路開始的（from 不是整數級距），天數偏短，不拿來比較也不算進平均 */
  partial: boolean
  /** 比前一個區間多花（正）或少花（負）幾天；前一個不完整或沒有時是 null */
  vsPrevious: number | null
  posts: GrowthPost[]
}
export interface GrowthProgress { from: number, to: number, started: string, daysSoFar: number, gained: number, partial: boolean, posts: GrowthPost[] }
export interface FollowerGrowth {
  step: number
  followers: number | null
  since: string | null
  averageDays: number | null
  inProgress: GrowthProgress | null
  /** 新的在前 */
  intervals: GrowthInterval[]
}

export const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)
/** ISO（UTC）時間落在台北的哪一天 */
export const taipeiDayOf = (iso: string) => new Date(Date.parse(iso) + 8 * 3600_000).toISOString().slice(0, 10)

const toGrowthPost = (p: GrowthSourcePost): GrowthPost => ({
  published: taipeiDayOf(p.publishedAt), text: p.text.replace(/\s+/g, ' ').trim().slice(0, 80), url: p.url, views: p.views, engagement: p.likes + p.comments + p.shares,
})
const byDay = (a: GrowthPost, b: GrowthPost) => a.published.localeCompare(b.published)

/**
 * 每成長 step 個粉絲花了幾天、跟前一個區間比、期間發了哪些貼文。stats 要照日期由舊到新。
 * 粉絲數掉下去又漲回來時，以第一次跨過為準，不重複算。貼文歸在發布當天所在的區間（達標那天發的算下一個區間）。
 */
export function followerGrowth(stats: FollowerDay[], sourcePosts: GrowthSourcePost[], step: number, today: string): FollowerGrowth {
  const first = stats[0]
  if (!first) return { step, followers: null, since: null, averageDays: null, inProgress: null, intervals: [] }
  const posts = sourcePosts.map(toGrowthPost).sort(byDay)
  const between = (from: string, to: string | null) => posts.filter(p => p.published >= from && (to == null || p.published < to))
  const current = stats.at(-1)!.followers
  const floor = Math.floor(first.followers / step) * step
  let from = first.followers
  let partial = first.followers !== floor
  let started = first.day
  let next = floor + step
  const done: GrowthInterval[] = []
  for (const row of stats) {
    // 一天跨過好幾個級距時，後面幾個的天數是 0；上限是防呆（級距設得太小）
    while (row.followers >= next && done.length < 500) {
      done.push({ from, to: next, started, reached: row.day, days: dayDiff(started, row.day), partial, vsPrevious: null, posts: between(started, row.day) })
      from = next
      partial = false
      started = row.day
      next += step
    }
  }
  done.forEach((interval, i) => {
    const previous = done[i - 1]
    if (previous && !previous.partial && !interval.partial) interval.vsPrevious = interval.days - previous.days
  })
  const full = done.filter(i => !i.partial)
  return {
    step,
    followers: current,
    since: first.day,
    averageDays: full.length ? Math.round(full.reduce((a, i) => a + i.days, 0) / full.length * 10) / 10 : null,
    inProgress: { from, to: next, started, daysSoFar: Math.max(0, dayDiff(started, today)), gained: current - from, partial, posts: between(started, null) },
    intervals: done.reverse(),
  }
}

export interface PeriodSummary {
  from: string
  to: string
  days: number
  /** 這段期間實際用到的粉絲紀錄；跟 from／to 不一樣代表紀錄不完整。完全沒有紀錄時三個都是 null */
  recordedFrom: string | null
  recordedTo: string | null
  startFollowers: number | null
  endFollowers: number | null
  gain: number | null
  /** 平均每天增加幾個粉絲（以實際有紀錄的天數算） */
  perDay: number | null
  posts: GrowthPost[]
  views: number
  engagement: number
}

/**
 * 一段自訂期間的粉絲增減與期間發的貼文。期初用「開始那天或更早的最後一筆」，沒有就用期間內的第一筆；
 * 期末用「結束那天或更早的最後一筆」。整段期間都還沒開始記錄時粉絲相關的欄位是 null，貼文照樣列。
 */
export function periodSummary(stats: FollowerDay[], sourcePosts: GrowthSourcePost[], from: string, to: string): PeriodSummary {
  const posts = sourcePosts.map(toGrowthPost).filter(p => p.published >= from && p.published <= to).sort(byDay)
  const base = {
    from, to, days: dayDiff(from, to) + 1, posts,
    views: posts.reduce((a, p) => a + p.views, 0), engagement: posts.reduce((a, p) => a + p.engagement, 0),
  }
  const end = stats.findLast(r => r.day <= to)
  const start = stats.findLast(r => r.day <= from) ?? stats.find(r => r.day <= to)
  // 最後一筆紀錄比期間開始還早：期間內沒有任何紀錄，不拿舊數字充數
  if (!start || !end || end.day < from) return { ...base, recordedFrom: null, recordedTo: null, startFollowers: null, endFollowers: null, gain: null, perDay: null }
  const recordedFrom = start.day < from ? from : start.day
  const span = dayDiff(recordedFrom, end.day)
  const gain = end.followers - start.followers
  return {
    ...base, recordedFrom, recordedTo: end.day, startFollowers: start.followers, endFollowers: end.followers, gain,
    perDay: span > 0 ? Math.round(gain / span * 10) / 10 : null,
  }
}
