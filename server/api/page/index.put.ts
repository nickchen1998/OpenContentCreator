import { and, eq, ne } from 'drizzle-orm'
import { publicPages } from '../../database/schema'

// 儲存草稿（與代號）。只動草稿，對外看到的版本要按發布才會變
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const body = await bodyOf(event)
  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : ''
  if (!SLUG_RE.test(slug)) throw bad('網址代號要是 3–32 個小寫英數字或 -，以英數字開頭')
  const db = useDb()
  const [taken] = await db.select({ ownerId: publicPages.ownerId }).from(publicPages).where(and(eq(publicPages.slug, slug), ne(publicPages.ownerId, uid)))
  if (taken) throw bad('這個網址代號已經有人用了')
  // 系列文封面的 key 只由上傳的端點寫入：沿用已經存著的，不收瀏覽器送來的（否則可以指到別人的圖）
  const existing = await loadPageRow(uid)
  const draft = JSON.stringify({ ...normalizePageConfig(body.draft), seriesCovers: parsePageConfig(existing?.draft)?.seriesCovers ?? {} })
  const now = nowIso()
  await db.insert(publicPages).values({ ownerId: uid, slug, draft, updatedAt: now })
    .onConflictDoUpdate({ target: publicPages.ownerId, set: { slug, draft, updatedAt: now } })
  return pageState(uid)
})
