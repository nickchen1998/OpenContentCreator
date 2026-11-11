import type { Boot } from './types'

export interface InsightPost {
  id: number
  accountId: number
  groupId: number
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

/** 把期間內的貼文彙整成成效總覽：總計、各帳號、各群組、表現最好的貼文 */
export function summarizeInsights(posts: InsightPost[], boot: Boot) {
  const accounts = boot.groups.flatMap(g => g.accounts.map(a => ({ ...a, groupName: g.name })))
  const rows = accounts.map(a => ({ accountId: a.id, groupId: a.groupId, groupName: a.groupName, platform: a.platform, name: a.name, posts: 0, views: 0, engagement: 0, saves: 0 }))
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
  const groups = boot.groups.map(g => ({ groupId: g.id, name: g.name, views: rows.filter(r => r.groupId === g.id).reduce((a, r) => a + r.views, 0) }))
  const top = [...posts].sort((a, b) => b.views - a.views || engagementOf(b) - engagementOf(a)).slice(0, 5)
  return { totals, rows, groups, top }
}
