import { eq } from 'drizzle-orm'
import { projectGroups, projects } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const id = idParam(event)
  const body = await bodyOf(event)
  const boot = await loadBoot(uidOf(event))
  if (!boot.projects.some(p => p.id === id)) throw notFound('專案')
  const db = useDb()
  await batchWrites([
    db.update(projects).set({ name: str(body.name, '專案名稱', 40), color: isProjectColor(body.color) ? body.color : 'blue' }).where(eq(projects.id, id)),
    db.delete(projectGroups).where(eq(projectGroups.projectId, id)),
    ...insertGrants(grantsOf(boot, body.grants ?? [], id)),
  ])
  return { ok: true }
})
