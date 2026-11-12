import { eq } from 'drizzle-orm'
import { publicPages } from '../../database/schema'

// 發布：把草稿（設定與圖片）複製成對外的版本。之後再改草稿，對外不會變，直到再按一次
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const row = await loadPageRow(uid)
  if (!row) throw bad('請先儲存頁面內容')
  // 先把精選貼文的成效重抓一次，發布出去的數字才是新的；抓不到不擋發布
  const syncFailed = await refreshFeaturedMetrics(uid, parsePageConfig(row.draft) ?? defaultPageConfig()).catch(() => -1)
  const now = nowIso()
  await useDb().update(publicPages).set({
    published: true, live: row.draft, liveAvatarKey: row.draftAvatarKey, liveCoverKey: row.draftCoverKey, publishedAt: now, updatedAt: now,
  }).where(eq(publicPages.ownerId, uid))
  // 被換掉、兩邊都不再用的舊圖片清掉
  await dropUnusedPageImages([row.liveAvatarKey, row.liveCoverKey, ...seriesCoverKeys(row.live)], await loadPageRow(uid))
  return { ...await pageState(uid), syncFailed }
})
