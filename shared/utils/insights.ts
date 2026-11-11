import type { Boot } from './types'

export interface InsightPost {
  id: number
  accountId: number
  url: string
  text: string
  publishedAt: string
  views: number
  likes: number
  comments: number
  shares: number
  saves: number
}

export const engagementOf = (t: { likes: number, comments: number, shares: number }) => t.likes + t.comments + t.shares

/** 把期間內的貼文彙整成成效總覽：總計、各帳號、表現最好的貼文 */
export function summarizeInsights(posts: InsightPost[], boot: Boot) {
  const rows = boot.accounts.map(a => ({ accountId: a.id, platform: a.platform, name: a.name, posts: 0, views: 0, engagement: 0, saves: 0 }))
  const byAccount = new Map(rows.map(r => [r.accountId, r]))
  for (const post of posts) {
    const row = byAccount.get(post.accountId)
    if (!row) continue
    row.posts += 1
    row.views += post.views
    row.engagement += engagementOf(post)
    row.saves += post.saves
  }
  const sum = (key: 'posts' | 'views' | 'engagement' | 'saves') => rows.reduce((a, r) => a + r[key], 0)
  const totals = { posts: sum('posts'), views: sum('views'), engagement: sum('engagement'), saves: sum('saves') }
  const top = [...posts].sort((a, b) => b.views - a.views || engagementOf(b) - engagementOf(a)).slice(0, 5)
  return { totals, rows, top }
}

export interface Collection { id: number, name: string, posts: InsightPost[] }

/** 一組貼文的合計 */
export function totalsOf(posts: InsightPost[]) {
  const views = posts.reduce((a, p) => a + p.views, 0)
  const engagement = posts.reduce((a, p) => a + engagementOf(p), 0)
  return { posts: posts.length, views, engagement, saves: posts.reduce((a, p) => a + p.saves, 0) }
}
