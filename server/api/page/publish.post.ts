import { eq } from 'drizzle-orm'
import { publicPages } from '../../database/schema'

// 發布：把草稿（設定與圖片）複製成對外的版本。之後再改草稿，對外不會變，直到再按一次
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const row = await loadPageRow(uid)
  if (!row) throw bad('請先儲存頁面內容')
  const now = nowIso()
  await useDb().update(publicPages).set({
    published: true, live: row.draft, liveAvatarKey: row.draftAvatarKey, liveCoverKey: row.draftCoverKey, publishedAt: now, updatedAt: now,
  }).where(eq(publicPages.ownerId, uid))
  // 被換掉、兩邊都不再用的舊圖片清掉
  await dropUnusedPageImages([row.liveAvatarKey, row.liveCoverKey], await loadPageRow(uid))
  return pageState(uid)
})
