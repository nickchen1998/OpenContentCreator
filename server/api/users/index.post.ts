import { eq } from 'drizzle-orm'
import { users } from '../../database/schema'

// 管理員建立會員：密碼由系統產生，只在這裡回傳一次
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await bodyOf(event)
  const username = usernameOf(body.username)
  const db = useDb()
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, username))
  if (existing) throw bad('這個帳號已經有人用了')
  const password = randomPassword()
  const [row] = await db.insert(users).values({ username, passwordHash: await hashPassword(password), isAdmin: false, createdAt: nowIso() }).returning({ id: users.id })
  return { id: row!.id, username, password }
})
