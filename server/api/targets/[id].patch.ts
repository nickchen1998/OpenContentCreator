import { eq } from 'drizzle-orm'
import { postTargets } from '../../database/schema'

// 單一平台的文案、發文後的連結、成效數字
export default defineEventHandler(async (event) => {
  const id = idParam(event)
  const body = await bodyOf(event)
  await ownedTarget(uidOf(event), id)
  const set: Partial<typeof postTargets.$inferInsert> = {}
  if (body.caption !== undefined) set.caption = str(body.caption, '文案', 10000, false)
  if (body.publishedUrl !== undefined) {
    const url = str(body.publishedUrl, '連結', 500, false)
    if (url && !/^https?:\/\//i.test(url)) throw bad('連結要以 http:// 或 https:// 開頭')
    set.publishedUrl = url
    set.publishedAt = url ? nowIso() : null
  }
  const metrics = ['views', 'likes', 'comments', 'shares', 'saves'] as const
  for (const key of metrics) {
    if (body[key] !== undefined) {
      set[key] = int(body[key], '成效數字')
      set.metricsUpdatedAt = nowIso()
    }
  }
  if (!Object.keys(set).length) throw bad('沒有要更新的內容')
  const [row] = await useDb().update(postTargets).set(set).where(eq(postTargets.id, id)).returning()
  if (!row) throw notFound('平台')
  return row
})
