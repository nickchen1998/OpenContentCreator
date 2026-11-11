import { eq } from 'drizzle-orm'
import { users } from '../../../database/schema'

// 刪除會員與他的所有資料（群組、貼文、素材、專案、規則）。不能刪自己，也不能刪管理員
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = idParam(event)
  if (id === uidOf(event)) throw bad('不能刪除自己的帳號')
  const [user] = await useDb().select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, id))
  if (!user) throw notFound('會員')
  if (user.isAdmin) throw bad('不能刪除管理員帳號')
  await deleteUserData(id)
  return { ok: true }
})
