import { projects } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const body = await bodyOf(event)
  const name = str(body.name, '專案名稱', 40)
  const color = isProjectColor(body.color) ? body.color : 'blue'
  const { token, tokenHash, tokenPrefix } = await newProjectToken()
  const [row] = await useDb().insert(projects).values({ ownerId: uidOf(event), name, color, priority: int(body.priority ?? 1, '優先序', 1, 99), canReadInsights: body.canReadInsights !== false, tokenHash, tokenPrefix, createdAt: nowIso() }).returning({ id: projects.id })
  // token 只在這裡回傳一次
  return { id: row!.id, token }
})
