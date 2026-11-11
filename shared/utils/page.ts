// 公開頁面（每個會員一頁對外的介紹頁，/p/<代號>）：設定的形狀、對外輸出的形狀、配色的推導。
// 編輯畫面、公開頁面與伺服器共用。

export const PAGE_BLOCKS = ['profile', 'accounts', 'stats', 'posts', 'series', 'text', 'links'] as const
export type PageBlock = typeof PAGE_BLOCKS[number]
export const PAGE_BLOCK_LABELS: Record<PageBlock, string> = {
  profile: '個人簡介', accounts: '社群帳號', stats: '成效數字', posts: '精選貼文', series: '系列文', text: '自訂文字', links: '連結按鈕',
}
export const PAGE_THEMES = ['night', 'forest', 'sunset'] as const
export type PageTheme = typeof PAGE_THEMES[number]
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,31}$/
export const COLOR_RE = /^#[0-9a-fA-F]{6}$/
export const PAGE_LIMITS = { posts: 6, series: 6, links: 6 }

/** 會員在編輯畫面調的東西（草稿與已發布的版本都是這個形狀）。圖片另外存，這裡不含 */
export interface PageConfig {
  name: string
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
  textTitle: string
  textBody: string
  links: { label: string, url: string }[]
}

export const defaultPageConfig = (name = ''): PageConfig => ({
  name, bio: '', theme: 'night', accent: '', bg: '',
  blocks: PAGE_BLOCKS.map(type => ({ type, on: type === 'profile' || type === 'accounts' })),
  postIds: [], seriesIds: [], textTitle: '', textBody: '', links: [],
})

/** 對外輸出的內容：只有打開的區塊才有資料 */
export interface PageView {
  name: string
  bio: string
  theme: PageTheme
  accent: string
  bg: string
  avatarUrl: string
  coverUrl: string
  /** 打開的區塊，照順序 */
  blocks: PageBlock[]
  accounts: { platform: Platform, name: string, followers: number | null, url: string }[]
  stats: { views: number, rate: string, posts: number } | null
  posts: { platform: Platform, text: string, url: string, views: number, rate: string, day: string }[]
  series: { name: string, posts: number, views: number }[]
  textTitle: string
  textBody: string
  links: { label: string, url: string }[]
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
