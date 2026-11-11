import { and, eq, gte, lte } from 'drizzle-orm'
import { posts } from '../../database/schema'

// ?from=YYYY-MM-DD&to=YYYY-MM-DD（含頭尾），或 ?status=pending 列出提案佇列（附建議的替代時段）
export default defineEventHandler(async (event) => {
  const { from, to, status } = getQuery(event)
  const boot = await loadBoot()
  if (status === 'pending') {
    const pending = await loadPosts(boot, eq(posts.status, 'pending'))
    if (!pending.length) return []
    const days = pending.map(p => p.scheduledAt.slice(0, 10)).sort()
    const slots = await loadSlots(boot, addDays(days[0]!, -1), addDays(days.at(-1)!, 15))
    return pending.map(p => ({
      ...p,
      suggestions: p.conflicts.length
        ? findOpenSlots({ postId: p.id, accountIds: p.targets.map(t => t.accountId), status: 'pending', priority: priorityOf(boot, p.projectId, p.groupId) }, p.scheduledAt, slots, boot, 2)
        : [],
    }))
  }
  if (typeof from !== 'string' || typeof to !== 'string' || !DAY_RE.test(from) || !DAY_RE.test(to)) throw bad('請帶 from 與 to（YYYY-MM-DD）')
  if (to < from || addDays(from, 100) < to) throw bad('期間最長 100 天')
  return loadPosts(boot, and(gte(posts.scheduledAt, `${from}T00:00`), lte(posts.scheduledAt, `${to}T23:59`)))
})
