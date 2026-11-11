import { eq } from 'drizzle-orm'
import { accounts } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const body = await bodyOf(event)
  await ownedAccount(uidOf(event), idParam(event))
  const [row] = await useDb().update(accounts).set({ name: str(body.name, '帳號名稱', 60) }).where(eq(accounts.id, idParam(event))).returning()
  if (!row) throw notFound('帳號')
  return row
})
