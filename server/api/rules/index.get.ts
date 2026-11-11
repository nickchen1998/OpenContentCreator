import { asc } from 'drizzle-orm'
import { replyRules } from '../../database/schema'

export default defineEventHandler(async () => {
  const rows = await useDb().select().from(replyRules).orderBy(asc(replyRules.id))
  return rows.map(({ cursor: _, createdAt: __, ...r }) => r)
})
