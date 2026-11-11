import { groups } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const body = await bodyOf(event)
  const [row] = await useDb().insert(groups).values({ name: str(body.name, '群組名稱', 40), topic: str(body.topic, '主題', 100, false), createdAt: nowIso() }).returning()
  return row
})
