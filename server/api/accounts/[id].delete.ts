import { eq } from 'drizzle-orm'
import { accounts } from '../../database/schema'

export default defineEventHandler(async (event) => {
  await useDb().delete(accounts).where(eq(accounts.id, idParam(event)))
  return { ok: true }
})
