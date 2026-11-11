// 帳號、專案、協調規則：各頁共用，改動後呼叫 refreshBoot()
export const useBoot = () => useState<Boot>('boot', () => ({ accounts: [], projects: [], rules: { minGapHours: 3, maxPerDay: 2, replyPerHour: 20 } }))
export const usePendingCount = () => useState<number>('pendingCount', () => 0)

/** 打 API；session 過期就回登入頁 */
export async function api<T = any>(url: string, options: Record<string, any> = {}): Promise<T> {
  try {
    return await ($fetch as any)(url, options) as T
  }
  catch (error: any) {
    if (error?.statusCode === 401 && !url.startsWith('/api/auth/')) {
      await useUserSession().clear().catch(() => {})
      await navigateTo('/login')
    }
    throw new Error(error?.data?.message || error?.message || '發生錯誤，請再試一次')
  }
}

export async function refreshBoot() {
  const [boot, pending] = await Promise.all([api<Boot>('/api/boot'), api<Post[]>('/api/posts', { query: { status: 'pending' } })])
  useBoot().value = boot
  usePendingCount().value = pending.length
  return boot
}

export function useLookup() {
  const boot = useBoot()
  const accounts = computed(() => boot.value.accounts)
  const account = (id: number) => accounts.value.find(a => a.id === id)
  const project = (id: number | null) => boot.value.projects.find(p => p.id === id)
  const platformLabel = (accountId: number, short = false) => {
    const a = account(accountId)
    return a ? PLATFORMS[a.platform][short ? 'short' : 'label'] : '已刪除'
  }
  const accountLabel = (accountId: number) => {
    const a = account(accountId)
    return a ? `${PLATFORMS[a.platform].label} · ${a.name}` : '已刪除的帳號'
  }
  const projectStyle = (id: number | null) => {
    const c = PROJECT_COLORS[project(id)?.color ?? 'gray']
    return { background: c.bg, color: c.fg }
  }
  const projectLabel = (post: Pick<Post, 'projectId'>) =>
    project(post.projectId)?.name ?? '自己排的'
  return { accounts, account, project, platformLabel, accountLabel, projectStyle, projectLabel }
}

const toast = () => useState<string>('toast', () => '')
let toastTimer: ReturnType<typeof setTimeout> | undefined
export const useToast = () => toast()
export function notify(message: string) {
  toast().value = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast().value = ''), 2600)
}

/** 包住會失敗的操作：錯誤用 toast 顯示 */
export async function attempt<T>(fn: () => Promise<T>, done?: string): Promise<T | undefined> {
  try {
    const result = await fn()
    if (done) notify(done)
    return result
  }
  catch (error: any) {
    notify(error.message)
  }
}

export const fmtNum = (n: number) => n.toLocaleString('en-US')
export function fmtSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * 「立即同步」：只有儀表板有這顆按鈕（使用者的決定，其他頁不要再放）。分兩個請求（各自有對外請求的上限）：
 * 先同步各帳號的貼文與成效數字，再抓 Threads 最新幾則貼文的整串對話。回傳 false 表示兩個都失敗
 */
export async function syncAll() {
  const data = await attempt(() => api<{ errors: string[] }>('/api/insights/sync', { method: 'POST' }))
  const talk = await attempt(() => api<{ errors: string[] }>('/api/feed/refresh', { method: 'POST' }))
  if (!data && !talk) return false
  const errors = [...(data?.errors ?? []), ...(talk?.errors ?? [])]
  notify(errors.length ? errors.join('；') : '已同步')
  return true
}

/** 設定類的畫面（帳號與連結、MCP 連線與提案、會員管理）不是頁面，是從使用者選單打開的視窗；開哪一個記在這裡。 */
export type SetupPanel = 'accounts' | 'connections' | 'members'
export const useSetupPanel = () => useState<SetupPanel | null>('setupPanel', () => null)
export const openSetup = (panel: SetupPanel) => (useSetupPanel().value = panel)

// 從 Google 的同意畫面回來時，結果是網址上的代碼（/accounts?youtube=ok 等）。只認得這幾個代碼，其他的一律不顯示，
// 免得有人做一個連結讓你看到他指定的文字
const YOUTUBE_RESULTS: Record<string, string> = {
  ok: 'YouTube 已連結',
  denied: 'YouTube 連結失敗：你沒有同意授權',
  google: 'YouTube 連結失敗：Google 沒有完成授權，請再試一次',
  invalid: 'YouTube 連結失敗：連結的請求無效，請再試一次',
  expired: 'YouTube 連結失敗：連結的請求過期了，請再試一次',
  account: 'YouTube 連結失敗：找不到要連結的帳號',
  notconfigured: 'YouTube 連結失敗：站方還沒有設定 YouTube 的連線資訊',
  nochannel: 'YouTube 連結失敗：這個 Google 帳號沒有 YouTube 頻道',
  norefresh: 'YouTube 連結失敗：請到 Google 帳號的「第三方應用程式存取權」移除這個應用程式後再連結一次',
  failed: 'YouTube 連結失敗，請再試一次',
}
/** 舊的設定頁網址：導回儀表板、打開對應的視窗。 */
export async function openSetupFromRoute(panel: SetupPanel) {
  const result = useRoute().query.youtube
  await navigateTo('/', { replace: true })
  openSetup(panel)
  if (panel === 'accounts' && typeof result === 'string' && YOUTUBE_RESULTS[result]) notify(YOUTUBE_RESULTS[result])
}
