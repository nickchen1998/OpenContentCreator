import type { SQL } from 'drizzle-orm'
import { and, asc, eq } from 'drizzle-orm'
import { posts, postTargets } from '../database/schema'

/** 讀出貼文與各平台的目標，並算好每一則是否違反協調規則。只會讀到 boot 那位會員的貼文。 */
export async function loadPosts(boot: OwnedBoot, where: SQL | undefined): Promise<Post[]> {
  const db = useDb()
  const rows = await db.select().from(posts).where(and(eq(posts.ownerId, boot.ownerId), where)).orderBy(asc(posts.scheduledAt), asc(posts.id))
  if (!rows.length) return []
  const ids = rows.map(r => r.id)
  const days = rows.map(r => r.scheduledAt.slice(0, 10)).sort()
  const [targets, slots] = await Promise.all([
    db.select().from(postTargets).where(inIdList(postTargets.postId, ids)).orderBy(asc(postTargets.id)),
    loadSlots(boot, addDays(days[0]!, -1), addDays(days.at(-1)!, 1)),
  ])
  return rows.map(({ ownerId: _owner, ...r }) => {
    const mine = targets.filter(t => t.postId === r.id).map(({ postId: _, externalPostId: __, ...t }) => t)
    const active = r.status === 'scheduled' || r.status === 'pending'
    return {
      ...r,
      status: r.status as PostStatus,
      source: r.source as Post['source'],
      targets: mine,
      conflicts: active
        ? findConflicts({ postId: r.id, accountIds: mine.map(t => t.accountId), at: r.scheduledAt, status: r.status as 'scheduled' | 'pending', priority: priorityOf(boot, r.projectId) }, slots, boot)
        : [],
    }
  })
}

export async function loadPost(boot: OwnedBoot, id: number) {
  const [post] = await loadPosts(boot, eq(posts.id, id))
  if (!post) throw notFound('貼文')
  return post
}

/** 確認帳號都是這個會員的 */
export function assertAccounts(boot: Boot, accountIds: number[]) {
  const valid = new Set(boot.accounts.map(a => a.id))
  if (accountIds.some(id => !valid.has(id))) throw bad('找不到選到的帳號')
}

export function scheduledAtOf(value: unknown) {
  if (!isValidAt(value)) throw bad('時間格式要是 YYYY-MM-DDTHH:MM（台北時間）')
  return value
}
