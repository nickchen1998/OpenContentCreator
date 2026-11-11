import { eq } from 'drizzle-orm'
import { collections } from '../../database/schema'

// 刪除系列文：貼文本身不受影響，之後那些貼文的留言不再自動回覆；留言紀錄留著但不再歸屬任何系列文
export default defineEventHandler(async (event) => {
  const id = idParam(event)
  await ownedSeries(uidOf(event), id)
  await useDb().delete(collections).where(eq(collections.id, id))
  return { ok: true }
})
