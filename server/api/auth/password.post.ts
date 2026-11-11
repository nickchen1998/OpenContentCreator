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
  const passwordHash = await hashPassword(next)
  await db.update(users).set({ passwordHash }).where(eq(users.id, uid))
  // 密碼一改，所有舊的登入都會失效；這個裝置換上新的版本，不用重新登入
  await setUserSession(event, { secure: { pv: await passwordVersion(passwordHash) } })
  return { ok: true }
})
