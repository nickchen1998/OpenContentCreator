import { eq } from 'drizzle-orm'
import { replyRules } from '../../database/schema'

export default defineEventHandler(async (event) => {
  await useDb().delete(replyRules).where(eq(replyRules.id, idParam(event)))
  return { ok: true }
})
