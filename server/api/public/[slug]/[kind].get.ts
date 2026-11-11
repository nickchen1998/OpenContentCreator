// 公開頁面的頭像與背景圖：不用登入，只給已發布頁面的這兩種圖，其他素材讀不到
export default defineEventHandler(async (event) => {
  const kind = getRouterParam(event, 'kind')
  if (!isPageImageKind(kind)) throw notFound('圖片')
  const found = await loadPublishedPage(getRouterParam(event, 'slug') ?? '')
  if (!found) throw notFound('圖片')
  // 網址帶著版本（換圖後網址會變），所以可以放心讓瀏覽器快取久一點
  return servePageImage(kind === 'avatar' ? found.row.liveAvatarKey : found.row.liveCoverKey, 'public, max-age=86400')
})
