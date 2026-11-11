import { eq } from 'drizzle-orm'
import { assets, posts } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const id = idParam(event)
  const db = useDb()
  await ownedPost(uidOf(event), id)
  const keys = await db.select({ key: assets.r2Key }).from(assets).where(eq(assets.postId, id))
  await db.delete(posts).where(eq(posts.id, id))
  if (keys.length) await useMedia().delete(keys.map(k => k.key))
  return { ok: true }
})
