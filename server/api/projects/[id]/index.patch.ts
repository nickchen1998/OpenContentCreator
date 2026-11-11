import { and, eq } from 'drizzle-orm'
import { projects } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const body = await bodyOf(event)
  const [row] = await useDb().update(projects).set({
    name: str(body.name, '專案名稱', 40),
    color: isProjectColor(body.color) ? body.color : 'blue',
    priority: int(body.priority ?? 1, '優先序', 1, 99),
    canReadInsights: body.canReadInsights !== false,
  }).where(and(eq(projects.id, idParam(event)), eq(projects.ownerId, uidOf(event)))).returning({ id: projects.id })
  if (!row) throw notFound('專案')
  return { ok: true }
})
