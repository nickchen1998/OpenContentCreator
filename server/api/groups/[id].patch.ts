import { eq } from 'drizzle-orm'
import { groups } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const body = await bodyOf(event)
  const [row] = await useDb().update(groups).set({ name: str(body.name, '群組名稱', 40), topic: str(body.topic, '主題', 100, false) }).where(eq(groups.id, idParam(event))).returning()
  if (!row) throw notFound('群組')
  return row
})
