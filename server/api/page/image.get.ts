// 編輯畫面預覽用：草稿的頭像或背景圖（要登入，只拿得到自己的）
export default defineEventHandler(async (event) => {
  const kind = getQuery(event).kind
  if (!isPageImageKind(kind)) throw bad('圖片種類不對')
  const row = await loadPageRow(uidOf(event))
  return servePageImage(kind === 'avatar' ? row?.draftAvatarKey ?? '' : row?.draftCoverKey ?? '', 'private, max-age=3600')
})
