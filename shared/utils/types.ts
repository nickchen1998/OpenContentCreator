import type { Platform, ProjectColor } from './platforms'

export interface Account { id: number, platform: Platform, name: string }
export interface Project { id: number, name: string, color: ProjectColor, tokenPrefix: string, priority: number, canReadInsights: boolean }
export interface Rules { minGapHours: number, maxPerDay: number, replyPerHour: number }
export interface Boot { accounts: Account[], projects: Project[], rules: Rules }

export type PostStatus = 'scheduled' | 'pending' | 'rejected' | 'withdrawn'
export interface Target {
  id: number
  accountId: number
  caption: string
  publishedUrl: string
  publishedAt: string | null
  views: number
  likes: number
  comments: number
  shares: number
  saves: number
  metricsUpdatedAt: string | null
  syncError: string
}
export interface Post {
  id: number
  projectId: number | null
  title: string
  scheduledAt: string
  status: PostStatus
  source: 'web' | 'mcp'
  note: string
  createdAt: string
  targets: Target[]
  /** 違反協調規則的原因；空陣列就是沒有撞期 */
  conflicts: string[]
}
export interface Asset { id: number, postId: number, filename: string, contentType: string, size: number, note: string }

/** own：帳號自己發的（送出的回覆、Threads 的子文），只用來組成對話，不算進留言數 */
export type CommentStatus = 'ready' | 'sent' | 'unmatched' | 'skipped' | 'handled' | 'own'
export interface CommentRow {
  id: number
  accountId: number
  postTitle: string
  author: string
  text: string
  createdAt: string
  ruleId: number | null
  ruleName: string
  replyText: string
  dmText: string
  reason: string
  status: CommentStatus
  externalId: string | null
  error: string
  collectionId: number | null
  externalPostId: string
  parentExternalId: string
  mine: boolean
}
export interface ConnectionInfo {
  accountId: number
  externalId: string
  externalName: string
  autoSend: boolean
  tokenExpiresAt: string | null
  lastEventAt: string | null
  lastError: string
  /** 最近一次記下的粉絲數（YouTube 是訂閱數）；還沒記過是 null */
  followers: number | null
}
