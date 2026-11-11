import { asc, eq } from 'drizzle-orm'
import { assets } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const id = idParam(event)
  const boot = await loadBoot(uidOf(event))
  const post = await loadPost(boot, id) // 先確認是自己的貼文，再讀素材
  const files = await useDb().select({ id: assets.id, postId: assets.postId, filename: assets.filename, contentType: assets.contentType, size: assets.size, note: assets.note })
      .from(assets).where(eq(assets.postId, id)).orderBy(asc(assets.id))
  return { post, assets: files }
})
