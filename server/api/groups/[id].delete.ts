import { eq } from 'drizzle-orm'
import { assets, groups, posts } from '../../database/schema'

// 群組底下的帳號、貼文、規則都會一起刪掉（外鍵 cascade），R2 上的素材也要清
export default defineEventHandler(async (event) => {
  const id = idParam(event)
  const db = useDb()
  const keys = await db.select({ key: assets.r2Key }).from(assets).innerJoin(posts, eq(posts.id, assets.postId)).where(eq(posts.groupId, id))
  await db.delete(groups).where(eq(groups.id, id))
  if (keys.length) await useMedia().delete(keys.map(k => k.key))
  return { ok: true }
})
