import { asc, eq } from 'drizzle-orm'
import { assets } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const id = idParam(event)
  const boot = await loadBoot()
  const [post, files] = await Promise.all([
    loadPost(boot, id),
    useDb().select({ id: assets.id, postId: assets.postId, filename: assets.filename, contentType: assets.contentType, size: assets.size, note: assets.note })
      .from(assets).where(eq(assets.postId, id)).orderBy(asc(assets.id)),
  ])
  return { post, assets: files }
})
