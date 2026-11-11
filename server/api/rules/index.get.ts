import { asc, eq } from 'drizzle-orm'
import { replyRules } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const rows = await useDb().select().from(replyRules).where(eq(replyRules.ownerId, uidOf(event))).orderBy(asc(replyRules.id))
  return rows.map(({ cursor: _, createdAt: __, ownerId: ___, ...r }) => r)
})
