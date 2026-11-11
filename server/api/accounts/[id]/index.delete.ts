import { eq } from 'drizzle-orm'
import { accounts } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  await ownedAccount(uidOf(event), idParam(event))
  await useDb().delete(accounts).where(eq(accounts.id, idParam(event)))
  return { ok: true }
})
