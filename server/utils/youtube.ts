// YouTube Data API v3。跟 Meta 不同：一定要走 Google OAuth（站方在 GCP 申請一組用戶端，會員各自授權自己的頻道），
// 存起來的是 refresh token，每次用它換短效的 access token。沒有留言的 webhook，靠排程輪詢；沒有私訊 API。
// 額度：整個站每天 10,000 單位。讀取（留言、影片數字）一次 1 單位，回一則留言 50 單位。

export class YoutubeError extends Error {}

const SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl'

// 本機測試時跟 Meta 一樣指到假的伺服器（NUXT_META_API_BASE 後面接 /youtube）
const fake = () => useRuntimeConfig().metaApiBase as string
const apiBase = () => (fake() ? `${fake()}/youtube` : 'https://www.googleapis.com/youtube/v3')
const tokenUrl = () => (fake() ? `${fake()}/youtube/token` : 'https://oauth2.googleapis.com/token')

export function youtubeClient() {
  const config = useRuntimeConfig()
  const id = config.youtubeClientId as string
  const secret = config.youtubeClientSecret as string
  if (!id || !secret) throw new YoutubeError('站方還沒有設定 YouTube 的連線資訊')
  return { id, secret }
}

/** Google 的同意畫面網址。access_type=offline 加 prompt=consent 才會每次都給 refresh token */
export function youtubeAuthUrl(redirectUri: string, state: string) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  for (const [k, v] of Object.entries({
    client_id: youtubeClient().id, redirect_uri: redirectUri, response_type: 'code', scope: SCOPE,
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state,
  })) url.searchParams.set(k, v)
  return url.toString()
}

async function tokenRequest(params: Record<string, string>) {
  const { id, secret } = youtubeClient()
  let response: Response
  try {
    response = await fetch(tokenUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: id, client_secret: secret, ...params }),
      signal: AbortSignal.timeout(8000),
    })
  }
  catch {
    throw new YoutubeError('連不上 Google 的伺服器，請稍後再試')
  }
  const data: any = await response.json().catch(() => ({}))
  if (!response.ok || data.error) {
    // invalid_grant：授權被撤銷或過期（同意畫面還在「測試中」時 7 天就過期）
    throw new YoutubeError(data.error === 'invalid_grant' ? '授權已失效，請重新連結 YouTube' : data.error_description || data.error || `Google 回應 ${response.status}`)
  }
  return data as { access_token: string, refresh_token?: string, expires_in: number }
}

/** 同意畫面回來的 code 換成 refresh token（長期保存）與 access token */
export const youtubeExchangeCode = (code: string, redirectUri: string) =>
  tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })

// access token 一小時有效：同一個 Worker 實例裡重複用，省掉每次呼叫前多換一次
const cache = new Map<string, { token: string, until: number }>()
async function accessOf(refreshToken: string) {
  const hit = cache.get(refreshToken)
  if (hit && hit.until > Date.now()) return hit.token
  const data = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken })
  cache.set(refreshToken, { token: data.access_token, until: Date.now() + (data.expires_in - 120) * 1000 })
  return data.access_token
}

interface CallInit { method?: string, query?: Record<string, string>, body?: unknown, access?: string }
async function call<T = any>(refreshToken: string, path: string, init: CallInit = {}): Promise<T> {
  const access = init.access ?? await accessOf(refreshToken)
  const url = new URL(`${apiBase()}${path}`)
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v)
  let response: Response
  try {
    response = await fetch(url, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${access}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(8000),
    })
  }
  catch {
    throw new YoutubeError('連不上 YouTube 的伺服器，請稍後再試')
  }
  const data: any = await response.json().catch(() => ({}))
  if (!response.ok || data?.error) {
    const reason = data?.error?.errors?.[0]?.reason
    if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') throw new YoutubeError('YouTube 今天的 API 額度用完了，明天下午會恢復')
    if (reason === 'commentsDisabled') throw new YoutubeError('這支影片關閉了留言')
    throw new YoutubeError(data?.error?.message || `YouTube 回應 ${response.status}`)
  }
  return data
}

/** 這組授權對應的頻道。access 是剛換到的 access token（連結當下還沒有存 refresh token 的快取） */
export async function youtubeChannel(refreshToken: string, access?: string) {
  const data = await call(refreshToken, '/channels', { query: { part: 'snippet', mine: 'true' }, access })
  const channel = data.items?.[0]
  if (!channel) throw new YoutubeError('這個 Google 帳號沒有 YouTube 頻道')
  return { externalId: String(channel.id), externalName: String(channel.snippet?.title ?? '') }
}

const count = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0)
const metricsOf = (stats: any) => ({ views: count(stats?.viewCount), likes: count(stats?.likeCount), comments: count(stats?.commentCount), shares: 0, saves: 0 })

/** 頻道最近上傳的影片與目前的數字（3 單位：找上傳清單、列影片、查數字） */
export async function youtubeVideos(refreshToken: string, channelId: string, limit = 25) {
  const channel = await call(refreshToken, '/channels', { query: { part: 'contentDetails', id: channelId } })
  const uploads = channel.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
  if (!uploads) return []
  const list = await call(refreshToken, '/playlistItems', { query: { part: 'contentDetails', playlistId: String(uploads), maxResults: String(limit) } })
  const ids: string[] = (list.items ?? []).map((i: any) => String(i.contentDetails?.videoId ?? '')).filter(Boolean)
  if (!ids.length) return []
  const videos = await call(refreshToken, '/videos', { query: { part: 'snippet,statistics', id: ids.join(','), maxResults: '50' } })
  return (videos.items ?? []).map((v: any) => ({
    id: String(v.id), url: `https://www.youtube.com/watch?v=${v.id}`, text: String(v.snippet?.title ?? '').slice(0, 500),
    publishedAt: new Date(String(v.snippet?.publishedAt ?? Date.now())).toISOString(), ...metricsOf(v.statistics),
  }))
}

/** 一支影片目前的數字（1 單位）。YouTube 不提供分享與收藏數 */
export async function youtubeMetrics(refreshToken: string, videoId: string) {
  const data = await call(refreshToken, '/videos', { query: { part: 'statistics', id: videoId } })
  if (!data.items?.[0]) throw new YoutubeError('找不到這支影片')
  return metricsOf(data.items[0].statistics)
}

export interface YoutubeNode { id: string, username: string, senderId: string, text: string, timestamp: string, parentId: string, mine: boolean }

/**
 * 一支影片底下最近的留言與回覆，攤平、舊的在前（1 單位）。parentId 是它回覆的那一則；直接留在影片底下的是影片 id。
 * 每則留言最多帶回 5 則回覆（API 的限制），更多的要另外查，這裡不追。
 */
export async function youtubeComments(refreshToken: string, videoId: string, channelId: string): Promise<YoutubeNode[]> {
  const data = await call(refreshToken, '/commentThreads', { query: { part: 'snippet,replies', videoId, order: 'time', maxResults: '50', textFormat: 'plainText' } })
  const nodes: YoutubeNode[] = []
  const push = (c: any, parentId: string) => {
    const s = c?.snippet ?? {}
    const senderId = String(s.authorChannelId?.value ?? '')
    nodes.push({
      id: String(c.id), username: String(s.authorDisplayName ?? '').replace(/^@/, ''), senderId, text: String(s.textOriginal ?? s.textDisplay ?? ''),
      timestamp: String(s.publishedAt ?? ''), parentId, mine: senderId === channelId,
    })
  }
  for (const thread of data.items ?? []) {
    const top = thread.snippet?.topLevelComment
    if (!top) continue
    push(top, videoId)
    for (const reply of thread.replies?.comments ?? []) push(reply, String(top.id))
  }
  return nodes.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
}

/** 回覆一則留言（50 單位）。YouTube 只有兩層：回覆「回覆」時要掛在最上層那則底下，parentId 帶 a.b 形式的 id 時取前半 */
export async function youtubeReply(refreshToken: string, commentId: string, text: string) {
  const parentId = commentId.split('.')[0]!
  const data = await call(refreshToken, '/comments', { method: 'POST', query: { part: 'snippet' }, body: { snippet: { parentId, textOriginal: text } } })
  return { id: String(data.id ?? '') }
}
