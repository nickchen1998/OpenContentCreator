import { eq } from 'drizzle-orm'
import { publicPages } from '../../database/schema'

// 上傳頭像、背景圖或系列文封面：檔案內容就是 request body。PUT /api/page/image?kind=avatar|cover，或 ?kind=series&id=<系列文 id>
// 只收 JPG、PNG、WebP（SVG 可以夾帶腳本，不收）；換圖只影響草稿，發布後才對外
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const query = getQuery(event)
  const kind = query.kind
  if (!isPageImageKind(kind) && kind !== 'series') throw bad('圖片種類不對')
  const seriesId = kind === 'series' ? await ownedSeriesId(uid, query.id) : 0
  const contentType = (getHeader(event, 'content-type') ?? '').split(';')[0]!.trim().toLowerCase()
  if (!PAGE_IMAGE_TYPES.includes(contentType)) throw bad('只能上傳 JPG、PNG 或 WebP 圖片')
  const limit = kind === 'series' ? SERIES_COVER_MAX : PAGE_IMAGE_MAX[kind]
  const declared = Number(getHeader(event, 'content-length'))
  if (Number.isFinite(declared) && declared > limit) throw bad(`圖片最大 ${limit / 1024 / 1024}MB`, 413)
  const row = await loadPageRow(uid)
  if (!row) throw bad('請先儲存頁面內容')
  const body = await readRawBody(event, false)
  if (!body?.byteLength) throw bad('沒有檔案內容')
  if (body.byteLength > limit) throw bad(`圖片最大 ${limit / 1024 / 1024}MB`, 413)
  // 不相信瀏覽器報的類型：看檔案開頭的特徵碼
  const head = new Uint8Array(body.slice(0, 12))
  const hex = [...head].map(b => b.toString(16).padStart(2, '0')).join('')
  const looksRight = contentType === 'image/jpeg' ? hex.startsWith('ffd8ff')
    : contentType === 'image/png' ? hex.startsWith('89504e470d0a1a0a')
      : hex.startsWith('52494646') && hex.slice(16, 24) === '57454250'
  if (!looksRight) throw bad('這個檔案不是有效的圖片')
  const key = kind === 'series' ? `pages/${uid}/series-${seriesId}-${crypto.randomUUID()}` : `pages/${uid}/${kind}-${crypto.randomUUID()}`
  await useMedia().put(key, body, { httpMetadata: { contentType } })
  if (kind === 'series') {
    const replaced = await setDraftSeriesCover(row, seriesId, key)
    await dropUnusedPageImages([replaced], await loadPageRow(uid))
    return pageState(uid)
  }
  const previous = kind === 'avatar' ? row.draftAvatarKey : row.draftCoverKey
  await useDb().update(publicPages).set({ ...(kind === 'avatar' ? { draftAvatarKey: key } : { draftCoverKey: key }), updatedAt: nowIso() }).where(eq(publicPages.ownerId, uid))
  await dropUnusedPageImages([previous], await loadPageRow(uid))
  return pageState(uid)
})
