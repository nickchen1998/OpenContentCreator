import { and, eq, gte, inArray, lte } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { posts, postTargets } from '../database/schema'

/** 連進來的專案：看得到所屬會員的帳號與排程，只能送提案 */
export interface McpContext { boot: OwnedBoot, project: Project }

interface Tool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  readOnly: boolean
  run: (args: Record<string, unknown>, ctx: McpContext) => Promise<unknown>
}

const AT = { type: 'string', description: '台北時間，格式 YYYY-MM-DDTHH:MM，例如 2026-11-20T18:00' }
const DAY = { type: 'string', description: '日期 YYYY-MM-DD（台北時間）' }
const ACCOUNT_IDS = { type: 'array', items: { type: 'integer' }, minItems: 1, description: '帳號 id（由 list_accounts 取得）' }
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false })

function resolveAccounts(ctx: McpContext, value: unknown) {
  const accountIds = idList(value, '帳號')
  assertAccounts(ctx.boot, accountIds)
  return accountIds
}

const describePost = (ctx: McpContext, p: Post) => ({
  post_id: p.id,
  title: p.title,
  scheduled_at: p.scheduledAt,
  status: p.status,
  project: p.projectId == null ? '（站主自己排的）' : ctx.boot.projects.find(x => x.id === p.projectId)?.name ?? '（已刪除的專案）',
  mine: p.projectId === ctx.project.id,
  accounts: p.targets.map(t => ({ account_id: t.accountId, name: accountLabel(ctx.boot, t.accountId), published: Boolean(t.publishedUrl) })),
  conflicts: p.conflicts,
})

function captionWrites(post: Post, captions: unknown): BatchItem<'sqlite'>[] {
  if (captions == null) return []
  if (typeof captions !== 'object' || Array.isArray(captions)) throw bad('captions 要是 { 帳號 id: 文案 } 的物件')
  return Object.entries(captions as Record<string, unknown>).map(([accountId, caption]) => {
    const target = post.targets.find(t => t.accountId === Number(accountId))
    if (!target) throw bad(`captions 裡的帳號 ${accountId} 不在這則貼文要發的帳號裡`)
    return useDb().update(postTargets).set({ caption: str(caption, '文案', 10000, false) }).where(eq(postTargets.id, target.id))
  })
}

async function myPendingPost(ctx: McpContext, value: unknown) {
  const post = await loadPost(ctx.boot, int(value, 'post_id', 1))
  if (post.projectId !== ctx.project.id) throw bad('只能修改自己專案送出的提案')
  if (post.status !== 'pending') throw bad('這筆提案已經處理過（已排入、已退回或已撤回），不能再改')
  return post
}

export const TOOLS: Tool[] = [
  {
    name: 'list_accounts',
    description: '列出可以使用的社群帳號（含 account_id）、本專案的優先序，以及目前的協調規則。其他工具需要的 account_id 都從這裡取得。',
    inputSchema: obj({}),
    readOnly: true,
    run: async (_, ctx) => ({
      project: ctx.project.name,
      my_priority: ctx.project.priority,
      can_read_insights: ctx.project.canReadInsights,
      rules: {
        min_gap_hours: ctx.boot.rules.minGapHours,
        max_posts_per_account_per_day: ctx.boot.rules.maxPerDay,
        note: '撞期與間隔以單一帳號計算。所有提案都要站主確認後才會排入。時間一律是台北時間。',
      },
      accounts: ctx.boot.accounts.map(a => ({ account_id: a.id, platform: a.platform, name: a.name })),
    }),
  },
  {
    name: 'list_schedule',
    description: '查詢指定期間（最長 62 天）所有專案的排程與待確認提案。規劃發文時間前先看這個，避免跟其他專案撞期。',
    inputSchema: obj({ from: DAY, to: DAY }, ['from', 'to']),
    readOnly: true,
    run: async (args, ctx) => {
      const { from, to } = dayRange(args, 62)
      const rows = await loadPosts(ctx.boot, and(inArray(posts.status, ['scheduled', 'pending']), gte(posts.scheduledAt, `${from}T00:00`), lte(posts.scheduledAt, `${to}T23:59`)))
      return { posts: rows.map(p => describePost(ctx, p)) }
    },
  },
  {
    name: 'find_open_slots',
    description: '依協調規則，從指定時間之後找出這些帳號都可用的整點時段（08:00–22:00，最多往後看 14 天）。',
    inputSchema: obj({ account_ids: ACCOUNT_IDS, after: AT, count: { type: 'integer', minimum: 1, maximum: 10, description: '要幾個時段，預設 5' } }, ['account_ids', 'after']),
    readOnly: true,
    run: async (args, ctx) => {
      const accountIds = resolveAccounts(ctx, args.account_ids)
      const after = scheduledAtOf(args.after)
      const slots = await loadSlots(ctx.boot, addDays(after.slice(0, 10), -1), addDays(after.slice(0, 10), 15))
      const count = args.count == null ? 5 : int(args.count, 'count', 1, 10)
      return { open_slots: findOpenSlots({ accountIds, status: 'pending', priority: ctx.project.priority }, after, slots, ctx.boot, count) }
    },
  },
  {
    name: 'check_conflicts',
    description: '送出提案前，先檢查這些帳號在某個時段是否違反協調規則（撞期、間隔不足、超過每日上限）。有衝突時會附上建議的替代時段。',
    inputSchema: obj({ account_ids: ACCOUNT_IDS, scheduled_at: AT }, ['account_ids', 'scheduled_at']),
    readOnly: true,
    run: async (args, ctx) => {
      const accountIds = resolveAccounts(ctx, args.account_ids)
      const at = scheduledAtOf(args.scheduled_at)
      const slots = await loadSlots(ctx.boot, addDays(at.slice(0, 10), -1), addDays(at.slice(0, 10), 15))
      const candidate = { accountIds, status: 'pending' as const, priority: ctx.project.priority }
      const conflicts = findConflicts({ ...candidate, at }, slots, ctx.boot)
      return { ok: !conflicts.length, conflicts, suggestions: conflicts.length ? findOpenSlots(candidate, at, slots, ctx.boot, 3) : [] }
    },
  },
  {
    name: 'get_insights',
    description: '讀取近 N 天已發出貼文的成效摘要（各帳號的發文數、觀看、互動，以及表現最好的貼文），用來決定發文時段與題材。數字每 30 分鐘從各平台同步一次。',
    inputSchema: obj({ days: { type: 'integer', minimum: 1, maximum: 90, description: '近幾天，預設 28' } }),
    readOnly: true,
    run: async (args, ctx) => {
      if (!ctx.project.canReadInsights) throw bad('這個專案沒有讀取成效的權限')
      const days = args.days == null ? 28 : int(args.days, 'days', 1, 90)
      const { posts: rows } = await loadInsights(ctx.boot.ownerId, days)
      const summary = summarizeInsights(rows, ctx.boot)
      return {
        days,
        totals: summary.totals,
        accounts: summary.rows.map(r => ({ account_id: r.accountId, name: `${PLATFORMS[r.platform].label}・${r.name}`, posts: r.posts, views: r.views, engagement: r.engagement })),
        top_posts: summary.top.map(t => ({ text: t.text, url: t.url, account: accountLabel(ctx.boot, t.accountId), published_at: t.publishedAt, views: t.views, engagement: engagementOf(t) })),
      }
    },
  },
  {
    name: 'propose_post',
    description: '送出一則貼文提案，進入站主的待確認佇列（不會直接排入，也不會自動發文）。可以附上各帳號的文案。有撞期也能送出，但會被標成時段衝突、可能被要求改時間，建議先用 check_conflicts 或 find_open_slots。這個工具不是冪等的：重送會再建立一筆提案。',
    inputSchema: obj({
      account_ids: ACCOUNT_IDS,
      title: { type: 'string', description: '貼文標題（給站主在排程上辨識用，最多 120 字）' },
      scheduled_at: AT,
      captions: { type: 'object', description: '各帳號的文案：{ "帳號 id": "文案內容" }', additionalProperties: { type: 'string' } },
      note: { type: 'string', description: '給站主的備註，例如素材在哪裡、為什麼選這個時段' },
    }, ['account_ids', 'title', 'scheduled_at']),
    readOnly: false,
    run: async (args, ctx) => {
      const accountIds = resolveAccounts(ctx, args.account_ids)
      const db = useDb()
      const [row] = await db.insert(posts).values({
        ownerId: ctx.boot.ownerId, projectId: ctx.project.id, title: str(args.title, '標題', 120), scheduledAt: scheduledAtOf(args.scheduled_at),
        note: str(args.note, '備註', 2000, false), status: 'pending', source: 'mcp', createdAt: nowIso(),
      }).returning({ id: posts.id })
      await db.insert(postTargets).values(accountIds.map(accountId => ({ postId: row!.id, accountId })))
      let post = await loadPost(ctx.boot, row!.id)
      try {
        const writes = captionWrites(post, args.captions)
        if (writes.length) {
          await batchWrites(writes)
          post = await loadPost(ctx.boot, row!.id)
        }
      }
      catch (error) {
        await db.delete(posts).where(eq(posts.id, row!.id))
        throw error
      }
      return { ...describePost(ctx, post), message: post.conflicts.length ? '提案已送出，但有時段衝突，站主可能會要求改時間。' : '提案已送出，等站主確認後才會排入。' }
    },
  },
  {
    name: 'update_proposal',
    description: '修改或撤回自己專案尚未確認的提案（標題、時間、文案、備註）。已排入或已退回的不能再改。',
    inputSchema: obj({
      post_id: { type: 'integer' },
      title: { type: 'string' },
      scheduled_at: AT,
      captions: { type: 'object', additionalProperties: { type: 'string' } },
      note: { type: 'string' },
      withdraw: { type: 'boolean', description: 'true 表示撤回這筆提案' },
    }, ['post_id']),
    readOnly: false,
    run: async (args, ctx) => {
      const post = await myPendingPost(ctx, args.post_id)
      const db = useDb()
      if (args.withdraw === true) {
        await db.update(posts).set({ status: 'withdrawn' }).where(eq(posts.id, post.id))
        return { post_id: post.id, status: 'withdrawn' }
      }
      const set: Partial<typeof posts.$inferInsert> = {}
      if (args.title !== undefined) set.title = str(args.title, '標題', 120)
      if (args.scheduled_at !== undefined) set.scheduledAt = scheduledAtOf(args.scheduled_at)
      if (args.note !== undefined) set.note = str(args.note, '備註', 2000, false)
      const writes = captionWrites(post, args.captions)
      if (Object.keys(set).length) writes.push(db.update(posts).set(set).where(eq(posts.id, post.id)))
      if (!writes.length) throw bad('沒有要修改的內容')
      await batchWrites(writes)
      return describePost(ctx, await loadPost(ctx.boot, post.id))
    },
  },
]

function dayRange(args: Record<string, unknown>, maxDays: number) {
  const { from, to } = args
  if (typeof from !== 'string' || typeof to !== 'string' || !DAY_RE.test(from) || !DAY_RE.test(to)) throw bad('from 與 to 要是 YYYY-MM-DD')
  if (to < from || addDays(from, maxDays) < to) throw bad(`期間最長 ${maxDays} 天`)
  return { from, to }
}
