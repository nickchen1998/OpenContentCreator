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

// 每一筆資料都直接歸屬到會員（owner_id），會員刪除時跟著刪
const owner = () => integer('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' })

// 會員登記的社群帳號
export const accounts = sqliteTable('accounts', {
  id: id(),
  ownerId: owner(),
  platform: text('platform').notNull(), // facebook | instagram | threads | youtube
  name: text('name').notNull(),
}, t => [index('accounts_owner_idx').on(t.ownerId)])

// 專案：各自的 Claude 用自己的 token 透過 MCP 連進來。token 只存 sha256
export const projects = sqliteTable('projects', {
  id: id(),
  // 這一欄是較早加上的，資料庫裡可空、沒有 cascade（SQLite 不能事後補），刪會員時要自己刪專案
  ownerId: integer('owner_id').references(() => users.id, { onDelete: 'cascade' }),
  priority: integer('priority').notNull().default(1), // 撞期時的優先序，數字小的優先
  canReadInsights: integer('can_read_insights', { mode: 'boolean' }).notNull().default(true),
  name: text('name').notNull(),
  color: text('color').notNull().default('blue'),
  tokenHash: text('token_hash').notNull().unique(),
  tokenPrefix: text('token_prefix').notNull(),
  createdAt: text('created_at').notNull(),
})

// 一筆發文規劃（系統不代發）。status: scheduled 已規劃 | pending 待確認的提案 | rejected 已退回 | withdrawn 專案自己撤回
export const posts = sqliteTable('posts', {
  id: id(),
  ownerId: owner(),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  scheduledAt: text('scheduled_at').notNull(), // 台北時間 'YYYY-MM-DDTHH:MM'
  status: text('status').notNull().default('scheduled'),
  source: text('source').notNull().default('web'), // web | mcp
  note: text('note').notNull().default(''),
  createdAt: text('created_at').notNull(),
}, t => [index('posts_owner_idx').on(t.ownerId, t.scheduledAt), index('posts_status_idx').on(t.status)])

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
  // 這則留言屬於哪個系列文（留言所在的貼文當時歸在哪個系列）。系列刪掉後變成 null，紀錄本身留著
  collectionId: integer('collection_id').references(() => collections.id, { onDelete: 'set null' }),
  // 對話串：這則是回覆哪一則留言（平台上的 id）；直接回在貼文底下的是空字串
  parentExternalId: text('parent_external_id').notNull().default(''),
  // 這則是不是帳號自己發的（自動或手動送出的回覆、Threads 的子文）。自己發的 status 一律是 own，不算進任何留言數
  mine: integer('mine', { mode: 'boolean' }).notNull().default(false),
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
  lastSyncedAt: text('last_synced_at'), // 上次同步貼文與成效的時間，排程用它輪替
  lastError: text('last_error').notNull().default(''),
  createdAt: text('created_at').notNull(),
}, t => [index('connections_external_idx').on(t.externalId)])

// 帳號在平台上的貼文與成效：連結後由排程自動抓（不用貼連結），成效總覽看的就是這張表
export const accountPosts = sqliteTable('account_posts', {
  id: id(),
  accountId: integer('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  externalId: text('external_id').notNull(),
  url: text('url').notNull().default(''),
  text: text('text').notNull().default(''),
  publishedAt: text('published_at').notNull(), // ISO（UTC）
  views: integer('views').notNull().default(0),
  likes: integer('likes').notNull().default(0),
  comments: integer('comments').notNull().default(0),
  shares: integer('shares').notNull().default(0),
  saves: integer('saves').notNull().default(0),
  insightsAt: text('insights_at'), // 上次抓 insight（觀看、分享、收藏）的時間；按讚與留言數每次同步都會更新
}, t => [uniqueIndex('account_posts_external_idx').on(t.accountId, t.externalId), index('account_posts_published_idx').on(t.accountId, t.publishedAt)])

// 系列文：會員挑的一組貼文（可以跨帳號、跨平台），一起看成效、共用一套留言回覆設定。
// 一則貼文只能屬於一個系列文（collection_posts.post_id 唯一），因為回覆設定跟著系列走。
export const collections = sqliteTable('collections', {
  id: id(),
  ownerId: owner(),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
  // 有人在系列裡的貼文留言時：matchType any = 任何留言都回；keyword = 留言含任一關鍵字才回
  matchType: text('match_type').notNull().default('any'),
  keywords: text('keywords').notNull().default(''), // 逗號分隔
  replies: text('replies', { mode: 'json' }).$type<string[]>().notNull().default([]), // 公開回覆，多句輪流；空的就是不回覆
  dmText: text('dm_text').notNull().default(''), // 同時私訊留言者的內容；空字串 = 不私訊
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  cursor: integer('cursor').notNull().default(0), // 輪替用：下一次要用第幾句
}, t => [index('collections_owner_idx').on(t.ownerId)])

export const collectionPosts = sqliteTable('collection_posts', {
  collectionId: integer('collection_id').notNull().references(() => collections.id, { onDelete: 'cascade' }),
  postId: integer('post_id').notNull().references(() => accountPosts.id, { onDelete: 'cascade' }),
}, t => [primaryKey({ columns: [t.collectionId, t.postId] }), uniqueIndex('collection_posts_post_idx').on(t.postId)])

// 帳號每天的粉絲數（YouTube 是訂閱數）。平台只給「現在是多少」，要自己每天記一筆才算得出增減
export const accountStats = sqliteTable('account_stats', {
  accountId: integer('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  day: text('day').notNull(), // 台北時間的 YYYY-MM-DD
  followers: integer('followers').notNull(),
}, t => [primaryKey({ columns: [t.accountId, t.day] })])

// 公開頁面：每個會員一頁對外的介紹頁（/p/<slug>），不用登入就能看。
// draft 是編輯中的設定，按發布時複製到 live；對外只讀 live，而且 published 要是 true。
// 設定是 JSON（形狀見 shared/utils/page.ts 的 PageConfig），頭像與背景圖的 R2 key 另外存
export const publicPages = sqliteTable('public_pages', {
  ownerId: integer('owner_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull().unique(),
  published: integer('published', { mode: 'boolean' }).notNull().default(false),
  draft: text('draft').notNull(),
  live: text('live'),
  // 圖片也分草稿與已發布兩份：換了頭像還沒發布時，對外看到的仍是舊的
  draftAvatarKey: text('draft_avatar_key').notNull().default(''),
  draftCoverKey: text('draft_cover_key').notNull().default(''),
  liveAvatarKey: text('live_avatar_key').notNull().default(''),
  liveCoverKey: text('live_cover_key').notNull().default(''),
  updatedAt: text('updated_at').notNull(),
  publishedAt: text('published_at'),
})
