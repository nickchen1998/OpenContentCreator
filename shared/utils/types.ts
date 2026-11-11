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

export interface ReplyRule {
  id: number
  name: string
  accountId: number | null
  postId: number | null
  channel: 'comment' | 'message'
  externalPostId: string
  postLabel: string
  matchType: 'keyword' | 'any'
  keywords: string
  action: 'reply' | 'reply_dm'
  replies: string[]
  dmText: string
  enabled: boolean
}
export type CommentStatus = 'ready' | 'sent' | 'unmatched' | 'skipped' | 'handled'
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
  kind: 'comment' | 'message'
  externalId: string | null
  error: string
}
export interface ConnectionInfo {
  accountId: number
  externalId: string
  externalName: string
  autoSend: boolean
  tokenExpiresAt: string | null
  lastEventAt: string | null
  lastError: string
}
