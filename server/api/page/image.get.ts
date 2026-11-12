// 編輯畫面預覽用：草稿的頭像、背景圖或系列文封面（要登入，只拿得到自己的）
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const kind = query.kind
  const uid = uidOf(event)
  const row = await loadPageRow(uid)
  if (kind === 'series') {
    const key = parsePageConfig(row?.draft)?.seriesCovers[String(query.id)] ?? ''
    return servePageImage(ownsPageImage(uid, key) ? key : '', 'private, max-age=3600')
  }
  if (!isPageImageKind(kind)) throw bad('圖片種類不對')
  return servePageImage(kind === 'avatar' ? row?.draftAvatarKey ?? '' : row?.draftCoverKey ?? '', 'private, max-age=3600')
})
