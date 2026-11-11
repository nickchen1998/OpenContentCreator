import { projects } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const body = await bodyOf(event)
  const boot = await loadBoot()
  const name = str(body.name, '專案名稱', 40)
  const color = isProjectColor(body.color) ? body.color : 'blue'
  grantsOf(boot, body.grants ?? [], 0) // 先驗證，建立後才有 id
  const { token, tokenHash, tokenPrefix } = await newProjectToken()
  const [row] = await useDb().insert(projects).values({ name, color, tokenHash, tokenPrefix, createdAt: nowIso() }).returning({ id: projects.id })
  await batchWrites(insertGrants(grantsOf(boot, body.grants ?? [], row!.id)))
  // token 只在這裡回傳一次
  return { id: row!.id, token }
})
