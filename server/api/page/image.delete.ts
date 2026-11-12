import { eq } from 'drizzle-orm'
import { publicPages } from '../../database/schema'

// 移除草稿的頭像、背景圖或系列文封面（對外的版本要發布後才會跟著移除）
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const query = getQuery(event)
  const kind = query.kind
  if (!isPageImageKind(kind) && kind !== 'series') throw bad('圖片種類不對')
  const row = await loadPageRow(uid)
  if (!row) return pageState(uid)
  if (kind === 'series') {
    const replaced = await setDraftSeriesCover(row, await ownedSeriesId(uid, query.id), '')
    await dropUnusedPageImages([replaced], await loadPageRow(uid))
    return pageState(uid)
  }
  const previous = kind === 'avatar' ? row.draftAvatarKey : row.draftCoverKey
  await useDb().update(publicPages).set({ ...(kind === 'avatar' ? { draftAvatarKey: '' } : { draftCoverKey: '' }), updatedAt: nowIso() }).where(eq(publicPages.ownerId, uid))
  await dropUnusedPageImages([previous], await loadPageRow(uid))
  return pageState(uid)
})
