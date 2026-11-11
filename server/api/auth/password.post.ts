import { eq } from 'drizzle-orm'
import { users } from '../../database/schema'

// 改自己的密碼：要先輸入目前的密碼
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const body = await bodyOf(event)
  const next = passwordOf(body.next)
  const db = useDb()
  const [user] = await db.select().from(users).where(eq(users.id, uid))
  if (!user || typeof body.current !== 'string' || !(await verifyPassword(body.current, user.passwordHash))) throw bad('目前的密碼不對')
  await db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, uid))
  return { ok: true }
})
