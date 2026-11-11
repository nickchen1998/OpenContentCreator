import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const id = () => integer('id').primaryKey({ autoIncrement: true })

// 會員：帳號加密碼登入，各自的資料互相看不到。帳號由管理員建立，沒有開放註冊
export const users = sqliteTable('users', {
  id: id(),
  username: text('username').notNull().unique(), // 一律小寫
  passwordHash: text('password_hash').notNull(), // pbkdf2$<次數>$<salt hex>$<hash hex>
  isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
})

// 帳密登入防爆破的計數。key 是帳號（不是 IP），帳號不存在也照樣計數
export const loginFailures = sqliteTable('login_failures', {
  username: text('username').primaryKey(),
  fails: integer('fails').notNull(),
  lockedUntil: integer('locked_until').notNull(), // epoch ms
  lastAt: integer('last_at').notNull(),
})

// 資料的擁有者只記在 groups 與 projects 上，其他表都經由群組（或專案）歸屬到會員。
// owner_id 在資料庫是可空的（SQLite 不能對既有的表加 NOT NULL 的外鍵欄位），程式一律會填。
const ownerId = () => integer('owner_id').references(() => users.id, { onDelete: 'cascade' })

// 帳號群組：一組同主題的帳號。排程、成效、回覆規則與 MCP 授權都以群組為單位
export const groups = sqliteTable('groups', {
  id: id(),
  ownerId: ownerId(),
  name: text('name').notNull(),
  topic: text('topic').notNull().default(''),
  createdAt: text('created_at').notNull(),
})

export const accounts = sqliteTable('accounts', {
  id: id(),
  groupId: integer('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  platform: text('platform').notNull(), // facebook | instagram | threads | youtube
  name: text('name').notNull(),
}, t => [index('accounts_group_idx').on(t.groupId)])

// 專案：各自的 Claude 用自己的 token 透過 MCP 連進來。token 只存 sha256
export const projects = sqliteTable('projects', {
  id: id(),
  ownerId: ownerId(),
  name: text('name').notNull(),
  color: text('color').notNull().default('blue'),
  tokenHash: text('token_hash').notNull().unique(),
  tokenPrefix: text('token_prefix').notNull(),
  createdAt: text('created_at').notNull(),
})

// 專案被授權的群組，以及在該群組內的優先序（數字小的優先）
export const projectGroups = sqliteTable('project_groups', {
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  groupId: integer('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  priority: integer('priority').notNull().default(1),
  canReadInsights: integer('can_read_insights', { mode: 'boolean' }).notNull().default(true),
}, t => [primaryKey({ columns: [t.projectId, t.groupId] })])

// 一筆發文規劃（系統不代發）。status: scheduled 已規劃 | pending 待確認的提案 | rejected 已退回 | withdrawn 專案自己撤回
export const posts = sqliteTable('posts', {
  id: id(),
  groupId: integer('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  scheduledAt: text('scheduled_at').notNull(), // 台北時間 'YYYY-MM-DDTHH:MM'
  status: text('status').notNull().default('scheduled'),
  source: text('source').notNull().default('web'), // web | mcp
  note: text('note').notNull().default(''),
  createdAt: text('created_at').notNull(),
}, t => [index('posts_scheduled_idx').on(t.scheduledAt), index('posts_status_idx').on(t.status)])

// 這筆規劃要發到哪個帳號：各平台的文案、發文後的連結與成效
export const postTargets = sqliteTable('post_targets', {
  id: id(),
  postId: integer('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  accountId: integer('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  caption: text('caption').notNull().default(''),
  publishedUrl: text('published_url').notNull().default(''),
  publishedAt: text('published_at'),
  views: integer('views').notNull().default(0),
  likes: integer('likes').notNull().default(0),
  comments: integer('comments').notNull().default(0),
  shares: integer('shares').notNull().default(0),
  saves: integer('saves').notNull().default(0),
  metricsUpdatedAt: text('metrics_updated_at'),
  externalPostId: text('external_post_id').notNull().default(''), // 平台上的貼文 id（由發文連結對出來，同步成效用）
  syncError: text('sync_error').notNull().default(''),
}, t => [index('post_targets_post_idx').on(t.postId), index('post_targets_account_idx').on(t.accountId)])

// 素材的 metadata，內容在 R2
export const assets = sqliteTable('assets', {
  id: id(),
  postId: integer('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  r2Key: text('r2_key').notNull(),
  filename: text('filename').notNull(),
  contentType: text('content_type').notNull(),
  size: integer('size').notNull(),
  note: text('note').notNull().default(''),
  createdAt: text('created_at').notNull(),
}, t => [index('assets_post_idx').on(t.postId)])

// 每個會員自己的協調規則（最小間隔、每日上限、每小時回覆上限）
export const userSettings = sqliteTable('user_settings', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  value: text('value').notNull(),
}, t => [primaryKey({ columns: [t.userId, t.key] })])

// 固定回覆規則：掛在群組，或群組內的單一帳號、單一貼文
export const replyRules = sqliteTable('reply_rules', {
  id: id(),
  name: text('name').notNull(),
  groupId: integer('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  accountId: integer('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
  postId: integer('post_id').references(() => posts.id, { onDelete: 'cascade' }),
  matchType: text('match_type').notNull().default('keyword'), // keyword | any
  keywords: text('keywords').notNull().default(''), // 逗號分隔，命中任一個就算
  action: text('action').notNull().default('reply'), // reply | reply_dm
  replies: text('replies', { mode: 'json' }).$type<string[]>().notNull(),
  dmText: text('dm_text').notNull().default(''),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  channel: text('channel').notNull().default('comment'), // comment 留言 | message 私訊
  // 只對平台上的某一則貼文生效（從帳號最近的貼文挑的）；空字串是全部貼文。postLabel 是當時的貼文文字，顯示用
  externalPostId: text('external_post_id').notNull().default(''),
  postLabel: text('post_label').notNull().default(''),
  cursor: integer('cursor').notNull().default(0), // 輪替用：下一次要用第幾句
  createdAt: text('created_at').notNull(),
})

// 留言與處理結果。status: ready 已選好固定回覆、待送出 | sent 已回覆 | unmatched 沒命中 | skipped 命中但不回（防洗版）| handled 你自己處理了
export const comments = sqliteTable('comments', {
  id: id(),
  accountId: integer('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  postTitle: text('post_title').notNull().default(''),
  author: text('author').notNull(),
  text: text('text').notNull(),
  createdAt: text('created_at').notNull(),
  ruleId: integer('rule_id'),
  ruleName: text('rule_name').notNull().default(''),
  replyText: text('reply_text').notNull().default(''),
  dmText: text('dm_text').notNull().default(''),
  reason: text('reason').notNull().default(''),
  status: text('status').notNull(),
  kind: text('kind').notNull().default('comment'), // comment 留言 | message 私訊
  externalId: text('external_id'), // 平台上的留言／訊息 id，webhook 重送時用來去重；手動貼入的是 null
  externalPostId: text('external_post_id').notNull().default(''), // 平台上的貼文 id
  senderId: text('sender_id').notNull().default(''), // 平台上的留言者／傳訊者 id（回私訊要用）
  error: text('error').notNull().default(''), // 送出失敗時平台回的錯誤
}, t => [index('comments_account_idx').on(t.accountId, t.createdAt), uniqueIndex('comments_external_idx').on(t.accountId, t.externalId)])

// 帳號與平台 API 的連結。Meta 的部分由會員用自己的 Meta App 產生 token 貼進來（只服務自己的帳號，不用 App Review）。
// token 與 app secret 用 NUXT_TOKEN_KEY 加密後才存。
export const connections = sqliteTable('connections', {
  id: id(),
  accountId: integer('account_id').notNull().unique().references(() => accounts.id, { onDelete: 'cascade' }),
  externalId: text('external_id').notNull(), // Instagram 帳號 id／Facebook 粉專 id（webhook 的 entry.id）／Threads 使用者 id
  externalName: text('external_name').notNull().default(''),
  tokenEnc: text('token_enc').notNull(),
  appSecretEnc: text('app_secret_enc').notNull(), // 驗 webhook 簽章用；Threads 不走 webhook，存空字串
  tokenExpiresAt: text('token_expires_at'),
  autoSend: integer('auto_send', { mode: 'boolean' }).notNull().default(true),
  lastEventAt: text('last_event_at'),
  lastPolledAt: text('last_polled_at'), // Threads 沒有 webhook 可用，靠排程輪詢
  lastError: text('last_error').notNull().default(''),
  createdAt: text('created_at').notNull(),
}, t => [index('connections_external_idx').on(t.externalId)])
