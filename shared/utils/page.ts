// 公開頁面（每個會員一頁對外的介紹頁，/p/<代號>）：設定的形狀、對外輸出的形狀、配色的推導。
// 編輯畫面、公開頁面與伺服器共用。

export const PAGE_BLOCKS = ['profile', 'accounts', 'stats', 'collab', 'posts', 'series', 'text', 'links'] as const
export type PageBlock = typeof PAGE_BLOCKS[number]
export const PAGE_BLOCK_LABELS: Record<PageBlock, string> = {
  profile: '個人簡介', accounts: '各平台數字', stats: '成效數字', collab: '合作', posts: '精選貼文', series: '系列文', text: '自訂文字', links: '連結按鈕',
}
export const PAGE_THEMES = ['night', 'forest', 'sunset'] as const
export type PageTheme = typeof PAGE_THEMES[number]
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,31}$/
export const COLOR_RE = /^#[0-9a-fA-F]{6}$/
export const PAGE_LIMITS = { posts: 6, series: 6, links: 6, collabItems: 8, collabBrands: 12, seriesTop: 3 }
/** 成效數字可以選的項目（畫面上的順序就是這個順序） */
export const PAGE_STATS = ['followers', 'avgViews', 'rate', 'growth', 'views', 'posts'] as const
export type PageStat = typeof PAGE_STATS[number]
export const PAGE_STAT_LABELS: Record<PageStat, string> = {
  followers: '全平台總粉絲', avgViews: '平均每則觀看', rate: '互動率', growth: '粉絲成長', views: '總觀看', posts: '發文數',
}
export const PAGE_STAT_DAYS = [28, 90] as const
const EMAIL_PATTERN = new RegExp('^[\\w.+-]+@[\\w-]+(\\.[\\w-]+)+$')
export const isContactEmail = (value: string) => EMAIL_PATTERN.test(value)

/** 會員在編輯畫面調的東西（草稿與已發布的版本都是這個形狀）。圖片另外存，這裡不含 */
export interface PageConfig {
  name: string
  /** 名稱上方的一行類別（例如「美食・旅遊」）；留空顯示 CREATOR */
  tagline: string
  bio: string
  theme: PageTheme
  /** 自訂主色／背景色；空字串表示跟著主題 */
  accent: string
  bg: string
  /** 區塊的順序與開關 */
  blocks: { type: PageBlock, on: boolean }[]
  /** 精選貼文（account_posts 的 id）、系列文的 id，照會員排的順序 */
  postIds: number[]
  seriesIds: number[]
  /** 成效數字：算幾天、顯示哪幾個 */
  statsDays: number
  statsShow: PageStat[]
  /** 精選貼文：能嵌入的用平台的嵌入框呈現（只顯示會員自己挑的那幾則，不自動補） */
  postsEmbed: boolean
  /** 合作：接什麼案、合作過誰、怎麼聯絡 */
  collabItems: string[]
  collabBrands: string[]
  contactEmail: string
  contactLabel: string
  /** 系列文：熱門貼文怎麼排（h 水平／v 垂直）、要不要列最熱門的幾則、每個系列文的一句介紹（key 是系列文 id） */
  seriesLayout: 'h' | 'v'
  seriesTop: boolean
  seriesText: Record<string, string>
  /** 每個系列文的封面在 R2 的 key。**只由上傳的端點寫入**，存草稿時不收瀏覽器送來的值 */
  seriesCovers: Record<string, string>
  textTitle: string
  textBody: string
  links: { label: string, url: string }[]
  /** 網址貼到 LINE、Facebook 等地方時預覽卡片上的標題與說明；留空就用名稱與介紹 */
  shareTitle: string
  shareText: string
}

export const defaultPageConfig = (name = ''): PageConfig => ({
  name, tagline: '', bio: '', theme: 'night', accent: '', bg: '',
  blocks: PAGE_BLOCKS.map(type => ({ type, on: type === 'profile' || type === 'accounts' || type === 'stats' })),
  postIds: [], seriesIds: [], textTitle: '', textBody: '', links: [], shareTitle: '', shareText: '',
  statsDays: 28, statsShow: ['followers', 'avgViews', 'rate', 'growth'], postsEmbed: true,
  collabItems: [], collabBrands: [], contactEmail: '', contactLabel: '',
  seriesLayout: 'h', seriesTop: true, seriesText: {}, seriesCovers: {},
})

/** 對外輸出的內容：只有打開的區塊才有資料 */
/** 平台的嵌入框：網址只會是 embedOf 組出來的那幾個平台網域 */
export interface PageEmbed { platform: Platform, src: string }
export interface PagePost { platform: Platform, text: string, url: string, views: number, rate: string, day: string, embed: PageEmbed | null }
export interface PageView {
  name: string
  tagline: string
  bio: string
  theme: PageTheme
  accent: string
  bg: string
  avatarUrl: string
  coverUrl: string
  /** 打開的區塊，照順序 */
  blocks: PageBlock[]
  /** avgViews／rate 是所選期間內發的貼文；growth 是期間內的粉絲增減，紀錄不夠久就是 null */
  accounts: { platform: Platform, name: string, followers: number | null, url: string, avgViews: number | null, rate: string, growth: number | null }[]
  /** n 是數字（null 表示沒有資料），text 是已經排好的字（互動率）；signed 的數字要帶正負號 */
  stats: { days: number, items: { key: PageStat, label: string, n: number | null, text: string, signed: boolean }[] } | null
  collab: { items: string[], brands: string[] } | null
  /** 合作洽詢的按鈕；合作區塊開著而且有填信箱才有 */
  contact: { label: string, email: string } | null
  posts: PagePost[]
  series: { name: string, text: string, coverUrl: string, posts: number, views: number, top: { platform: Platform, text: string, url: string, views: number, day: string }[] }[]
  seriesLayout: 'h' | 'v'
  textTitle: string
  textBody: string
  links: { label: string, url: string }[]
  /** 分享預覽實際會用的標題、說明與圖片（已經套過「留空就用名稱與介紹」「有背景圖用背景圖，否則用頭像」） */
  share: { title: string, text: string, image: string }
}

// ---- 配色 ----
// 會員只選「背景色」與「主色」，卡片、線條、文字由背景的明暗推出來，怎麼選都讀得清楚。

const PRESETS: Record<PageTheme, { bg: string, accent: string }> = {
  night: { bg: '#0e1410', accent: '#c6f432' },
  forest: { bg: '#f7f6ee', accent: '#3e5346' },
  sunset: { bg: '#1b1220', accent: '#ff8a4c' },
}
export const PAGE_ACCENTS = [['萊姆', '#c6f432'], ['珊瑚橘', '#ff8a4c'], ['桃紅', '#ff5c9a'], ['天藍', '#5cc8ff'], ['薄荷', '#5ce6b8'], ['金黃', '#ffd23f'], ['紫', '#b79cff'], ['深綠', '#3e5346']] as const
export const PAGE_GROUNDS = [['近黑', '#0e1410'], ['深藍', '#0f1b2d'], ['深紫', '#1b1220'], ['酒紅', '#2a1215'], ['米白', '#f7f6ee'], ['白', '#ffffff']] as const
export const PAGE_THEME_LABELS: Record<PageTheme, string> = { night: '夜色', forest: '森林', sunset: '晚霞' }
export const themePreset = (theme: PageTheme) => PRESETS[theme] ?? PRESETS.night

const rgb = (hex: string) => [0, 2, 4].map(i => Number.parseInt(hex.slice(1 + i, 3 + i), 16))
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}
const mix = (a: string, b: string, weight: number) => {
  const x = rgb(a)
  const y = rgb(b)
  return `#${x.map((v, i) => Math.round(v * (1 - weight) + y[i]! * weight).toString(16).padStart(2, '0')).join('')}`
}

/** 這一頁要用的顏色，直接當成 CSS 變數放到最外層 */
export function pageColors(view: Pick<PageView, 'theme' | 'accent' | 'bg'>) {
  const preset = themePreset(view.theme)
  const bg = COLOR_RE.test(view.bg) ? view.bg : preset.bg
  const accent = COLOR_RE.test(view.accent) ? view.accent : preset.accent
  const dark = luminance(bg) < 0.35
  const card = dark ? mix(bg, '#ffffff', 0.07) : mix(bg, '#ffffff', 0.82)
  return {
    '--pg-bg': bg,
    '--pg-card': card,
    '--pg-line': dark ? mix(bg, '#ffffff', 0.18) : mix(bg, '#000000', 0.14),
    '--pg-ink': dark ? '#f6f7f4' : '#22281f',
    '--pg-muted': dark ? mix(bg, '#ffffff', 0.68) : mix(bg, '#000000', 0.62),
    // 主色拿來當文字（小標、數字）時要跟卡片有足夠對比：太接近就退回文字色
    '--pg-accent': accent,
    '--pg-accent-text': Math.abs(luminance(accent) - luminance(card)) < 0.18 ? (dark ? '#f6f7f4' : '#22281f') : accent,
    '--pg-on-accent': luminance(accent) > 0.4 ? '#101410' : '#ffffff',
    '--pg-grid': dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
    '--pg-hero': `radial-gradient(120% 140% at 0% 0%, ${mix(bg, accent, dark ? 0.22 : 0.16)} 0%, ${card} 60%)`,
  }
}

// ---- 嵌入 ----
// 精選貼文可以用平台自己的嵌入框呈現（圖片、影片、平台的樣式都帶進來，我們不存任何媒體）。
// 一律是「直接放 iframe」：不在我們的頁面載入平台的腳本（公開頁面跟後台同一個網域，外來腳本能以登入會員的身分打 API）。
// Instagram 與 Threads 的網址是官方腳本內部用的，沒有寫在文件上（2026-11-12 實測可用）；哪天失效就把這裡改成回 null，頁面會退回文字卡片。

export function embedOf(platform: Platform, url: string, externalId: string): PageEmbed | null {
  if (platform === 'youtube') {
    return /^[\w-]{6,20}$/.test(externalId) ? { platform, src: `https://www.youtube.com/embed/${externalId}` } : null
  }
  if (platform === 'instagram') {
    const m = /^https:\/\/www\.instagram\.com\/(?:[\w.]+\/)?(p|reel|tv)\/([\w-]+)/.exec(url)
    return m ? { platform, src: `https://www.instagram.com/${m[1]}/${m[2]}/embed/` } : null
  }
  if (platform === 'threads') {
    const m = /^https:\/\/www\.threads\.(?:net|com)\/@([\w.]+)\/post\/([\w-]+)/.exec(url)
    return m ? { platform, src: `https://www.threads.com/@${m[1]}/post/${m[2]}/embed` } : null
  }
  if (platform === 'facebook') {
    return /^https:\/\/(www\.)?facebook\.com\//.test(url)
      ? { platform, src: `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(url)}&show_text=true&width=350` }
      : null
  }
  return null
}
