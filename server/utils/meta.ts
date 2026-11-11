// Meta 的三個平台：Instagram（Instagram Login，graph.instagram.com）、Facebook 粉專（graph.facebook.com）、
// Threads（graph.threads.net）。會員用自己的 Meta App 產生 token，所以這裡只需要 token，不需要我們自己的 app id。
export type MetaPlatform = 'instagram' | 'facebook' | 'threads'
export const isMetaPlatform = (p: string): p is MetaPlatform => p === 'instagram' || p === 'facebook' || p === 'threads'
/** 有 webhook 可用的平台。Threads 的 webhook 要通過 App Review，會員自己的 App 收不到，改用排程輪詢 */
export const hasWebhook = (p: MetaPlatform) => p !== 'threads'

const HOSTS: Record<MetaPlatform, string> = {
  instagram: 'https://graph.facebook.com/v27.0',
  facebook: 'https://graph.facebook.com/v27.0',
  threads: 'https://graph.threads.net/v1.0',
}
/**
 * Instagram 有兩種設定，token 與主機都不一樣、不能混用：
 * - 統一登入（Unified Login，2026 起新建的 App 只有這個）：token 是 EAA 開頭的系統用戶權杖，打 graph.facebook.com
 * - 舊的「Instagram 登入」：token 是 IG 開頭，打 graph.instagram.com，60 天到期要換新
 * 用 token 的開頭分辨，不另外存欄位。
 */
export const isInstagramLoginToken = (token: string) => token.startsWith('IG')
// 測試時可以用 NUXT_META_API_BASE 指到假的伺服器（網址後面接 /instagram、/facebook、/threads）
const base = (platform: MetaPlatform, token: string) => {
  const override = useRuntimeConfig().metaApiBase
  if (override) return `${override}/${platform}`
  return platform === 'instagram' && isInstagramLoginToken(token) ? 'https://graph.instagram.com/v27.0' : HOSTS[platform]
}

export class MetaError extends Error {
  constructor(message: string, public code?: number, public status?: number) {
    super(message)
  }
}

interface CallInit { method?: string, body?: unknown, query?: Record<string, string> }

async function call<T = any>(platform: MetaPlatform, token: string, path: string, init: CallInit = {}): Promise<T> {
  const url = new URL(`${base(platform, token)}${path}`)
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v)
  let response: Response
  try {
    response = await fetch(url, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(8000),
    })
  }
  catch {
    throw new MetaError('連不上 Meta 的伺服器，請稍後再試')
  }
  const data: any = await response.json().catch(() => ({}))
  if (!response.ok || data?.error) {
    throw new MetaError(data?.error?.message || `Meta 回應 ${response.status}`, data?.error?.code, response.status)
  }
  return data
}

/**
 * 用 token 查出它代表哪個帳號。Instagram 與粉專回傳的 id 就是 webhook 的 entry.id。
 * hint 是使用者在帳號群組填的帳號名稱：統一登入的 token 可能同時授權了好幾個 Instagram 帳號，用它挑出是哪一個。
 */
export async function identify(platform: MetaPlatform, token: string, hint = '') {
  if (platform === 'instagram' && isInstagramLoginToken(token)) {
    const me = await call(platform, token, '/me', { query: { fields: 'user_id,username' } })
    if (!me.user_id) throw new MetaError('這個 token 不是 Instagram 專業帳號的 token')
    return { externalId: String(me.user_id), externalName: String(me.username ?? '') }
  }
  if (platform === 'instagram') {
    // 統一登入：/me 是系統用戶不是帳號，要從「被指派的 Instagram 帳號」裡找
    const data = await call(platform, token, '/me/assigned_instagram_accounts', { query: { fields: 'id,username' } })
    const list: { id: string, username?: string }[] = data.data ?? []
    if (!list.length) throw new MetaError('這個 token 沒有被授權任何 Instagram 帳號')
    const wanted = hint.trim().replace(/^@/, '').toLowerCase()
    const picked = list.length === 1 ? list[0]! : list.find(a => String(a.username ?? '').toLowerCase() === wanted)
    if (!picked) throw new MetaError(`這個 token 授權了多個 Instagram 帳號（${list.map(a => a.username).join('、')}），請把這裡的帳號名稱改成其中一個再連結`)
    return { externalId: String(picked.id), externalName: String(picked.username ?? '') }
  }
  if (platform === 'threads') {
    const me = await call(platform, token, '/me', { query: { fields: 'id,username' } })
    return { externalId: String(me.id), externalName: String(me.username ?? '') }
  }
  // 粉專的 Page access token：/me 就是粉專本身
  const me = await call(platform, token, '/me', { query: { fields: 'id,name' } })
  return { externalId: String(me.id), externalName: String(me.name ?? '') }
}

/**
 * 粉專的 token 要從「用戶權杖」換：Meta 後台 Messenger 頁的「產生」只給私訊權限，回不了留言。
 * 做法是請會員在「圖形 API 測試工具」勾好權限拿一組用戶權杖（1–2 小時就過期），我們用 app id／secret 換成長效的，
 * 再從 /me/accounts 取出粉專自己的 Page token（由長效用戶權杖換來的 Page token 不會到期）。
 */
export async function pageTokenFromUserToken(userToken: string, appId: string, appSecret: string, hint = '') {
  const long = await call('facebook', userToken, '/oauth/access_token', {
    query: { grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: userToken },
  })
  const data = await call('facebook', String(long.access_token), '/me/accounts', { query: { fields: 'id,name,access_token', limit: '100' } })
  const pages: { id: string, name: string, access_token: string }[] = data.data ?? []
  // 粉專放在商家資產管理組合底下時，沒有 business_management 權限的話 /me/accounts 會是空的
  if (!pages.length) throw new MetaError('這個權杖看不到任何粉專。產生權杖時請加上 business_management 權限，並在授權視窗勾選你的粉專')
  const wanted = hint.trim().toLowerCase()
  const picked = pages.length === 1
    ? pages[0]!
    : pages.find(p => p.id === wanted || p.name.toLowerCase() === wanted) ?? pages.find(p => wanted && p.name.toLowerCase().includes(wanted))
  if (!picked) throw new MetaError(`這個權杖授權了多個粉專（${pages.map(p => p.name).join('、')}），請把這裡的帳號名稱改成其中一個再連結`)
  return { token: picked.access_token, externalId: String(picked.id), externalName: picked.name }
}

/** 這個 token 是不是個人的用戶權杖（Page token 沒有 /me/accounts） */
export const isUserToken = (token: string) => call('facebook', token, '/me/accounts', { query: { limit: '1' } }).then(() => true, () => false)

/** 粉專 token 實際拿到的權限，連結時用來提醒缺了什麼 */
export async function missingPagePermissions(token: string) {
  const needed = ['pages_read_engagement', 'pages_manage_metadata', 'pages_manage_engagement', 'pages_read_user_content', 'pages_messaging']
  try {
    const data = await call('facebook', token, '/me/permissions')
    const granted = new Set((data.data ?? []).filter((p: any) => p.status === 'granted').map((p: any) => p.permission))
    return needed.filter(p => !granted.has(p))
  }
  catch {
    return [] // Page token 查不到權限清單時不擋
  }
}

/** 讓這個帳號的事件送到 Meta App 設定的 webhook */
export function subscribe(platform: MetaPlatform, token: string, selfId: string) {
  return call(platform, token, `/${selfId}/subscribed_apps`, {
    method: 'POST',
    query: { subscribed_fields: platform === 'instagram' ? 'comments' : 'feed' },
  })
}

/** 公開回覆一則留言。Threads 的回覆是「發一則 reply_to_id 指向對方的貼文」，要先建立再發布 */
export async function replyToComment(platform: MetaPlatform, token: string, selfId: string, commentId: string, text: string) {
  if (platform === 'threads') {
    const container = await call(platform, token, `/${selfId}/threads`, { method: 'POST', query: { media_type: 'TEXT', text, reply_to_id: commentId } })
    return call(platform, token, `/${selfId}/threads_publish`, { method: 'POST', query: { creation_id: String(container.id) } })
  }
  return call(platform, token, platform === 'instagram' ? `/${commentId}/replies` : `/${commentId}/comments`, { method: 'POST', body: { message: text } })
}

const messageBody = (platform: MetaPlatform, recipient: Record<string, string>, text: string) =>
  ({ recipient, message: { text }, ...(platform === 'facebook' ? { messaging_type: 'RESPONSE' } : {}) })

/** 留言後主動私訊（private reply）：每則留言只能送一次，而且要在留言後 7 天內。Threads 沒有私訊 API */
export function privateReply(platform: MetaPlatform, token: string, selfId: string, commentId: string, text: string) {
  if (platform === 'threads') throw new MetaError('Threads 不支援私訊')
  return call(platform, token, `/${selfId}/messages`, { method: 'POST', body: messageBody(platform, { comment_id: commentId }, text) })
}

/** 貼文的文字（給留言紀錄顯示用），拿不到就算了 */
export async function postCaption(platform: MetaPlatform, token: string, postId: string) {
  try {
    const post = await call(platform, token, `/${postId}`, { query: { fields: platform === 'instagram' ? 'caption' : platform === 'threads' ? 'text' : 'message' } })
    return clip(post.caption ?? post.message ?? post.text)
  }
  catch {
    return ''
  }
}
const clip = (text: unknown) => String(text ?? '').replace(/\s+/g, ' ').slice(0, 40)

/** 「Instagram 登入」與 Threads 的長效 token 60 天到期，滿 24 小時後可以換新（再 60 天）。粉專與統一登入的 token 不走這裡 */
export async function refreshToken(platform: 'instagram' | 'threads', token: string) {
  const data = await call(platform, token, '/refresh_access_token', {
    query: { grant_type: platform === 'instagram' ? 'ig_refresh_token' : 'th_refresh_token', access_token: token },
  })
  return { token: String(data.access_token), expiresAt: new Date(Date.now() + Number(data.expires_in ?? 5184000) * 1000).toISOString() }
}

// ---- 成效（insight）----

export interface RemotePost { id: string, url: string, text: string }

/** 帳號最近的貼文（含連結），用來把「貼上的發文連結」對到平台上的貼文 id */
export async function listRecentPosts(platform: MetaPlatform, token: string, selfId: string, limit = 50): Promise<RemotePost[]> {
  const [path, fields] = platform === 'instagram'
    ? [`/${selfId}/media`, 'id,permalink,caption']
    : platform === 'threads' ? [`/${selfId}/threads`, 'id,permalink,text'] : [`/${selfId}/posts`, 'id,permalink_url,message']
  const data = await call(platform, token, path, { query: { fields, limit: String(limit) } })
  return (data.data ?? []).map((p: any) => ({ id: String(p.id), url: String(p.permalink ?? p.permalink_url ?? ''), text: clip(p.caption ?? p.text ?? p.message) }))
}

/** 連結裡能代表「哪一則貼文」的那一段：IG 的 shortcode、Threads 的 post 代碼、FB 的貼文 id */
export function postKeyOf(platform: MetaPlatform, url: string) {
  try {
    const u = new URL(url)
    const path = u.pathname.replace(/\/+$/, '')
    if (platform === 'instagram') return path.match(/\/(?:p|reel|reels|tv)\/([^/]+)/)?.[1] ?? ''
    if (platform === 'threads') return path.match(/\/post\/([^/]+)/)?.[1] ?? ''
    return u.searchParams.get('story_fbid') ?? u.searchParams.get('fbid') ?? u.searchParams.get('v') ?? path.split('/').pop() ?? ''
  }
  catch {
    return ''
  }
}

export function matchPost(platform: MetaPlatform, publishedUrl: string, posts: RemotePost[]) {
  const key = postKeyOf(platform, publishedUrl)
  if (!key) return
  // 粉專貼文的 id 是「粉專 id_貼文 id」，連結裡有時直接是後半段
  return posts.find(p => postKeyOf(platform, p.url) === key || p.id === key || p.id.endsWith(`_${key}`))
}

export interface Metrics { views: number, likes: number, comments: number, shares: number, saves: number }
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0)
/** insights 回應的 data[] 轉成 { 指標名稱: 數字 } */
const insightMap = (data: any) => Object.fromEntries((data?.data ?? []).map((m: any) => [m.name, num(m.values?.[0]?.value ?? m.total_value?.value)]))

/** 一則貼文目前的累計成效 */
export async function fetchMetrics(platform: MetaPlatform, token: string, postId: string): Promise<Metrics> {
  if (platform === 'threads') {
    const m = insightMap(await call(platform, token, `/${postId}/insights`, { query: { metric: 'views,likes,replies,reposts,quotes,shares' } }))
    return { views: num(m.views), likes: num(m.likes), comments: num(m.replies), shares: num(m.reposts) + num(m.quotes) + num(m.shares), saves: 0 }
  }
  if (platform === 'instagram') {
    try {
      const m = insightMap(await call(platform, token, `/${postId}/insights`, { query: { metric: 'views,likes,comments,shares,saved' } }))
      return { views: num(m.views), likes: num(m.likes), comments: num(m.comments), shares: num(m.shares), saves: num(m.saved) }
    }
    catch {
      // 有些類型的貼文不支援全部指標（整個請求會失敗），退回貼文本身的按讚與留言數
      const p = await call(platform, token, `/${postId}`, { query: { fields: 'like_count,comments_count' } })
      return { views: 0, likes: num(p.like_count), comments: num(p.comments_count), shares: 0, saves: 0 }
    }
  }
  const p = await call(platform, token, `/${postId}`, { query: { fields: 'shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)' } })
  // 觀看數：新的指標是 post_media_view，舊的 App 權限可能只有 post_impressions；都拿不到就記 0
  const views = await call(platform, token, `/${postId}/insights`, { query: { metric: 'post_media_view' } }).then(d => num(insightMap(d).post_media_view))
    .catch(() => call(platform, token, `/${postId}/insights`, { query: { metric: 'post_impressions' } }).then(d => num(insightMap(d).post_impressions)).catch(() => 0))
  return { views, likes: num(p.reactions?.summary?.total_count), comments: num(p.comments?.summary?.total_count), shares: num(p.shares?.count), saves: 0 }
}

// ---- Threads 輪詢 ----

export interface ThreadReply { id: string, username: string, text: string, timestamp: string }

/** 某一則 Threads 貼文底下的回覆（新的在前） */
export async function listThreadReplies(token: string, threadId: string): Promise<ThreadReply[]> {
  const data = await call('threads', token, `/${threadId}/replies`, { query: { fields: 'id,text,username,timestamp', reverse: 'true', limit: '25' } })
  return (data.data ?? []).map((r: any) => ({ id: String(r.id), username: String(r.username ?? ''), text: String(r.text ?? ''), timestamp: String(r.timestamp ?? '') }))
}

// ---- 自動匯入貼文與成效（成效總覽用）----

export interface RemotePostStats {
  id: string
  url: string
  text: string
  publishedAt: string
  /** 列表這一趟就拿得到的數字；拿不到的是 undefined，不要蓋掉資料庫裡的舊值 */
  likes?: number
  comments?: number
  shares?: number
}

/** 帳號最近的貼文，連同列表本身就附帶的數字（一個請求）。觀看、分享、收藏要另外用 fetchInsights 逐則抓 */
export async function listPostsWithStats(platform: MetaPlatform, token: string, selfId: string, limit = 25): Promise<RemotePostStats[]> {
  const iso = (v: unknown) => {
    const d = new Date(String(v ?? ''))
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
  }
  if (platform === 'instagram') {
    const data = await call(platform, token, `/${selfId}/media`, { query: { fields: 'id,permalink,caption,timestamp,like_count,comments_count', limit: String(limit) } })
    return (data.data ?? []).map((p: any) => ({ id: String(p.id), url: String(p.permalink ?? ''), text: clip(p.caption), publishedAt: iso(p.timestamp), likes: num(p.like_count), comments: num(p.comments_count) }))
  }
  if (platform === 'threads') {
    const data = await call(platform, token, `/${selfId}/threads`, { query: { fields: 'id,permalink,text,timestamp', limit: String(limit) } })
    return (data.data ?? []).map((p: any) => ({ id: String(p.id), url: String(p.permalink ?? ''), text: clip(p.text), publishedAt: iso(p.timestamp) }))
  }
  const data = await call(platform, token, `/${selfId}/posts`, {
    query: { fields: 'id,permalink_url,message,created_time,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)', limit: String(limit) },
  })
  return (data.data ?? []).map((p: any) => ({
    id: String(p.id), url: String(p.permalink_url ?? ''), text: clip(p.message), publishedAt: iso(p.created_time),
    likes: num(p.reactions?.summary?.total_count), comments: num(p.comments?.summary?.total_count), shares: num(p.shares?.count),
  }))
}

/**
 * 單一貼文的 insight：列表拿不到的那幾個數字。拿不到（權限不足、貼文類型不支援）就丟錯，由呼叫端決定怎麼記。
 * Instagram 1 個請求、Threads 1 個、Facebook 1–2 個。
 */
export async function fetchInsights(platform: MetaPlatform, token: string, postId: string): Promise<Partial<Metrics>> {
  if (platform === 'threads') {
    const m = insightMap(await call(platform, token, `/${postId}/insights`, { query: { metric: 'views,likes,replies,reposts,quotes,shares' } }))
    return { views: num(m.views), likes: num(m.likes), comments: num(m.replies), shares: num(m.reposts) + num(m.quotes) + num(m.shares) }
  }
  if (platform === 'instagram') {
    const m = insightMap(await call(platform, token, `/${postId}/insights`, { query: { metric: 'views,shares,saved' } }))
    return { views: num(m.views), shares: num(m.shares), saves: num(m.saved) }
  }
  // 觀看數：新的指標是 post_media_view，舊的是 post_impressions
  const m = await call(platform, token, `/${postId}/insights`, { query: { metric: 'post_media_view' } }).then(insightMap)
    .catch(() => call(platform, token, `/${postId}/insights`, { query: { metric: 'post_impressions' } }).then(insightMap))
  return { views: num(m.post_media_view ?? m.post_impressions) }
}
