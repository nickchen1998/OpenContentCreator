import { and, eq } from 'drizzle-orm'
import { posts, postTargets } from '../../../database/schema'

// 改標題、時間、備註、專案、要發的帳號；action 用來處理提案：approve 排入（可同時改時間）、reject 退回
export default defineEventHandler(async (event) => {
  const id = idParam(event)
  const body = await bodyOf(event)
  const boot = await loadBoot(uidOf(event))
  const post = await loadPost(boot, id)
  const db = useDb()
  const set: Partial<typeof posts.$inferInsert> = {}
  if (body.title !== undefined) set.title = str(body.title, '標題', 120)
  if (body.scheduledAt !== undefined) set.scheduledAt = scheduledAtOf(body.scheduledAt)
  if (body.note !== undefined) set.note = str(body.note, '備註', 2000, false)
  if (body.projectId !== undefined) {
    set.projectId = body.projectId == null ? null : int(body.projectId, '專案', 1)
    if (set.projectId != null && !boot.projects.some(p => p.id === set.projectId)) throw bad('找不到這個專案')
  }
  if (body.action === 'approve') {
    if (post.status !== 'pending') throw bad('這筆不是待確認的提案')
    set.status = 'scheduled'
  }
  else if (body.action === 'reject') {
    if (post.status !== 'pending') throw bad('這筆不是待確認的提案')
    set.status = 'rejected'
  }
  const writes = []
  if (Object.keys(set).length) writes.push(db.update(posts).set(set).where(eq(posts.id, id)))
  if (body.accountIds !== undefined) {
    const accountIds = idList(body.accountIds, '帳號')
    assertAccounts(boot, accountIds)
    const current = post.targets.map(t => t.accountId)
    for (const accountId of current.filter(a => !accountIds.includes(a))) {
      writes.push(db.delete(postTargets).where(and(eq(postTargets.postId, id), eq(postTargets.accountId, accountId))))
    }
    const added = accountIds.filter(a => !current.includes(a))
    if (added.length) writes.push(db.insert(postTargets).values(added.map(accountId => ({ postId: id, accountId }))))
  }
  await batchWrites(writes)
  return loadPost(boot, id)
})
