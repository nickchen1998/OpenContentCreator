import { and, eq } from 'drizzle-orm'
import { collectionPosts, collections } from '../../database/schema'

// 改名、加入貼文（addPostIds）、移出貼文（removePostIds）
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const id = idParam(event)
  const body = await bodyOf(event)
  await ownedCollection(uid, id)
  const db = useDb()
  if (body.name !== undefined) await db.update(collections).set({ name: str(body.name, '系列名稱', 40) }).where(eq(collections.id, id))
  await addToCollection(id, await ownedPostIds(uid, body.addPostIds))
  const remove = Array.isArray(body.removePostIds) ? body.removePostIds.map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 200) : []
  if (remove.length) await db.delete(collectionPosts).where(and(eq(collectionPosts.collectionId, id), inIdList(collectionPosts.postId, remove)))
  return { ok: true }
})
