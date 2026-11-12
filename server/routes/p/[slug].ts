import { env } from 'cloudflare:workers'

// 公開頁面的 HTML 外殼。頁面內容是瀏覽器載入後才抓的，但 LINE、Facebook、Threads 這些產生「網址預覽」的程式不會執行頁面上的程式，
// 只讀伺服器第一時間回的 HTML。所以 /p/<代號> 先經過這裡（nuxt.config 的 run_worker_first 有列 /p/*）：
// 拿原本的外殼，把這一頁的標題、說明、圖片寫進預覽用的標籤再回應。訪客看到的頁面跟原本一樣。

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c]!)
const meta = (attr: 'name' | 'property', key: string, content: string) => `<meta ${attr}="${key}" content="${escapeHtml(content)}">`

// 這個回應不是靜態資產，public/_headers 管不到，同樣的安全標頭要自己帶
const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': 'frame-ancestors \'none\'; base-uri \'self\'; object-src \'none\'; form-action \'self\'',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
}

export default defineEventHandler(async (event) => {
  const origin = getRequestURL(event).origin
  const slug = getRouterParam(event, 'slug') ?? ''
  // 外殼就是靜態資產裡的首頁（SPA 每個路徑用的都是同一份）
  const shell = await (env as unknown as { ASSETS: { fetch: (input: string) => Promise<Response> } }).ASSETS.fetch(`${origin}/`)
  let html = await shell.text()
  const found = await loadPublishedPage(slug)
  if (found) {
    const view = await buildPageView(found.row.ownerId, found.config, livePageImages(found.row, found.config))
    const title = view.share.title
    const image = view.share.image ? `${origin}${view.share.image}` : `${origin}/icon-192.png`
    const tags = [
      ...(view.share.text ? [meta('name', 'description', view.share.text), meta('property', 'og:description', view.share.text)] : []),
      meta('property', 'og:type', 'profile'),
      meta('property', 'og:site_name', 'OpenContentCreator'),
      meta('property', 'og:title', title),
      meta('property', 'og:url', `${origin}/p/${found.row.slug}`),
      meta('property', 'og:image', image),
      // 有背景圖（橫的）時用大圖卡片；只有頭像（正方形）時用小圖，不然會被裁得很怪
      meta('name', 'twitter:card', found.row.liveCoverKey ? 'summary_large_image' : 'summary'),
      meta('name', 'twitter:title', title),
      meta('name', 'twitter:image', image),
    ].join('')
    html = html
      .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`)
      // 全站預設不給搜尋引擎收錄，已發布的公開頁面例外
      .replace(/<meta name="robots"[^>]*>/, '<meta name="robots" content="index, follow">')
      .replace('</head>', `${tags}</head>`)
  }
  return new Response(html, {
    // 沒發布或不存在的代號：一樣回外殼（頁面會顯示「找不到這個頁面」），但狀態是 404，預覽程式與搜尋引擎才不會當成有效頁面
    status: found ? 200 : 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=120', ...SECURITY_HEADERS },
  })
})
