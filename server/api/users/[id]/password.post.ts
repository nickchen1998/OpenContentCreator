import { eq } from 'drizzle-orm'
import { loginFailures, users } from '../../../database/schema'

// 管理員重設會員的密碼：新密碼只在這裡回傳一次，順便解除登入鎖定
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = idParam(event)
  const db = useDb()
  const password = randomPassword()
  const [row] = await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, id)).returning({ username: users.username })
  if (!row) throw notFound('會員')
  await db.delete(loginFailures).where(eq(loginFailures.username, row.username))
  return { id, username: row.username, password }
})
