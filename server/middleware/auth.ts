import { eq } from 'drizzle-orm'
import { users } from '../database/schema'

// /api 底下除了登入、session 與平台的 webhook（/api/hooks，自己驗簽章）以外都要先登入，並把會員 id 放進 event.context.userId。/mcp 自己驗專案 token。
// 每個請求都依 id 重新查一次會員：帳號被刪掉、或密碼改過，手上的 session 就立刻失效。
export default defineEventHandler(async (event) => {
  const path = event.path.split('?')[0]!
  if (!path.startsWith('/api/') || path.startsWith('/api/auth/login') || path.startsWith('/api/_auth/') || path.startsWith('/api/hooks/')) return
  const session = await requireUserSession(event)
  const id = (session.user as { id?: unknown }).id
  // 多會員制之前發的 session 沒有 id，一律當成沒登入
  const [user] = typeof id === 'number' ? await useDb().select({ id: users.id, isAdmin: users.isAdmin, passwordHash: users.passwordHash }).from(users).where(eq(users.id, id)) : []
  // 密碼改過（自己改或管理員重設）之後，舊的 session 帶的版本對不上，一律當成沒登入
  const version = (session.secure as { pv?: unknown } | undefined)?.pv
  if (!user || version !== await passwordVersion(user.passwordHash)) {
    await clearUserSession(event)
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }
  event.context.userId = user.id
  event.context.isAdmin = user.isAdmin
})
