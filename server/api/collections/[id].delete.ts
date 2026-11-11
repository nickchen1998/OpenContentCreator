import { eq } from 'drizzle-orm'
import { collections } from '../../database/schema'

// 刪除系列（貼文本身不受影響）
export default defineEventHandler(async (event) => {
  const id = idParam(event)
  await ownedCollection(uidOf(event), id)
  await useDb().delete(collections).where(eq(collections.id, id))
  return { ok: true }
})
