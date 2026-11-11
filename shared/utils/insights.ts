import type { Boot, Post } from './types'

export const engagementOf = (t: { likes: number, comments: number, shares: number }) => t.likes + t.comments + t.shares

/** 把期間內已發出的貼文彙整成成效總覽。只算已貼上連結（已發文）的平台。 */
export function summarizeInsights(posts: Post[], boot: Boot) {
  const accounts = boot.groups.flatMap(g => g.accounts.map(a => ({ ...a, groupName: g.name })))
  const rows = accounts.map(a => ({ accountId: a.id, groupId: a.groupId, groupName: a.groupName, platform: a.platform, name: a.name, posts: 0, views: 0, engagement: 0, saves: 0 }))
  const byAccount = new Map(rows.map(r => [r.accountId, r]))
  const top: { postId: number, title: string, accountId: number, groupId: number, views: number, engagement: number }[] = []
  for (const post of posts) {
    if (post.status !== 'scheduled') continue
    for (const t of post.targets) {
      const row = byAccount.get(t.accountId)
      if (!row || !t.publishedUrl) continue
      row.posts += 1
      row.views += t.views
      row.engagement += engagementOf(t)
      row.saves += t.saves
      top.push({ postId: post.id, title: post.title, accountId: t.accountId, groupId: post.groupId, views: t.views, engagement: engagementOf(t) })
    }
  }
  const sum = (key: 'posts' | 'views' | 'engagement' | 'saves') => rows.reduce((a, r) => a + r[key], 0)
  const totals = { posts: sum('posts'), views: sum('views'), engagement: sum('engagement'), saves: sum('saves') }
  const groups = boot.groups.map(g => ({
    groupId: g.id,
    name: g.name,
    views: rows.filter(r => r.groupId === g.id).reduce((a, r) => a + r.views, 0),
  }))
  top.sort((a, b) => b.views - a.views || b.engagement - a.engagement)
  return { totals, rows, groups, top: top.slice(0, 5) }
}
