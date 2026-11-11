import { posts, postTargets } from '../../database/schema'

// 自己在網頁上新增規劃：直接進排程（撞期只提醒，不擋）
export default defineEventHandler(async (event) => {
  const body = await bodyOf(event)
  const boot = await loadBoot()
  const groupId = int(body.groupId, '群組', 1)
  const accountIds = idList(body.accountIds, '帳號')
  assertAccountsInGroup(boot, groupId, accountIds)
  const projectId = body.projectId == null ? null : int(body.projectId, '專案', 1)
  if (projectId != null && !boot.projects.some(p => p.id === projectId)) throw bad('找不到這個專案')
  const db = useDb()
  const [row] = await db.insert(posts).values({
    groupId, projectId, title: str(body.title, '標題', 120), scheduledAt: scheduledAtOf(body.scheduledAt),
    note: str(body.note, '備註', 2000, false), status: 'scheduled', source: 'web', createdAt: nowIso(),
  }).returning({ id: posts.id })
  await db.insert(postTargets).values(accountIds.map(accountId => ({ postId: row!.id, accountId })))
  return loadPost(boot, row!.id)
})
