// 公開頁面的頭像、背景圖與系列文封面：不用登入，只給已發布頁面設定裡的這幾種圖，其他素材讀不到
export default defineEventHandler(async (event) => {
  const kind = getRouterParam(event, 'kind')
  const found = await loadPublishedPage(getRouterParam(event, 'slug') ?? '')
  if (!found) throw notFound('圖片')
  // 網址帶著版本（換圖後網址會變），所以可以放心讓瀏覽器快取久一點
  if (kind === 'series') {
    // 只給「系列文區塊開著、而且有被選進頁面」的那幾個系列文的封面
    const id = String(getQuery(event).id ?? '')
    const shown = found.config.blocks.some(b => b.type === 'series' && b.on) && found.config.seriesIds.includes(Number(id))
    const key = shown ? found.config.seriesCovers[id] ?? '' : ''
    if (!ownsPageImage(found.row.ownerId, key)) throw notFound('圖片')
    return servePageImage(key, 'public, max-age=86400')
  }
  if (!isPageImageKind(kind)) throw notFound('圖片')
  return servePageImage(kind === 'avatar' ? found.row.liveAvatarKey : found.row.liveCoverKey, 'public, max-age=86400')
})
