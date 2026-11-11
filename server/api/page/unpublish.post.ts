import { eq } from 'drizzle-orm'
import { publicPages } from '../../database/schema'

// 取消發布：網址立刻變成找不到頁面。內容留著，之後可以再發布
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  await useDb().update(publicPages).set({ published: false, updatedAt: nowIso() }).where(eq(publicPages.ownerId, uid))
  return pageState(uid)
})
