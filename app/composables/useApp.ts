// 群組、專案、協調規則：各頁共用，改動後呼叫 refreshBoot()
export const useBoot = () => useState<Boot>('boot', () => ({ groups: [], projects: [], rules: { minGapHours: 3, maxPerDay: 2, replyPerHour: 20 } }))
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
  const accounts = computed(() => boot.value.groups.flatMap(g => g.accounts))
  const account = (id: number) => accounts.value.find(a => a.id === id)
  const group = (id: number) => boot.value.groups.find(g => g.id === id)
  const project = (id: number | null) => boot.value.projects.find(p => p.id === id)
  const platformLabel = (accountId: number, short = false) => {
    const a = account(accountId)
    return a ? PLATFORMS[a.platform][short ? 'short' : 'label'] : '已刪除'
  }
  const accountLabel = (accountId: number) => {
    const a = account(accountId)
    return a ? `${group(a.groupId)?.name ?? ''} · ${PLATFORMS[a.platform].label}` : '已刪除的帳號'
  }
  const projectStyle = (id: number | null) => {
    const c = PROJECT_COLORS[project(id)?.color ?? 'gray']
    return { background: c.bg, color: c.fg }
  }
  const projectLabel = (post: Pick<Post, 'groupId' | 'projectId'>) =>
    `${group(post.groupId)?.name ?? ''}｜${project(post.projectId)?.name ?? '自己排的'}`
  return { accounts, account, group, project, platformLabel, accountLabel, projectStyle, projectLabel }
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
