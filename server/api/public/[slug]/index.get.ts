// 公開頁面的內容：**不用登入**（server/middleware/auth.ts 放行 /api/public/）。
// 只回已發布的版本、只含會員打開的區塊；沒發布或代號不存在一律 404，不透露是哪一種
export default defineEventHandler(async (event) => {
  const found = await loadPublishedPage(getRouterParam(event, 'slug') ?? '')
  if (!found) throw notFound('頁面')
  setResponseHeader(event, 'Cache-Control', 'public, max-age=120')
  return buildPageView(found.row.ownerId, found.config, livePageImages(found.row))
})
