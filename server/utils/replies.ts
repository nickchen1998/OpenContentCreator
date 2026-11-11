import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { accounts, comments, groups, replyRules } from '../database/schema'

export interface Incoming {
  accountId: number
  kind: 'comment'
  author: string
  text: string
  postId?: number | null
  postTitle?: string
  /** 以下三個只有從平台 webhook 進來的才有 */
  externalId?: string
  externalPostId?: string
  senderId?: string
}

/**
 * 固定回覆的規則引擎。只有命中規則的留言才會得到一句事先寫好的回覆（規則有設的話再加一則私訊），沒命中的不處理。
 * 防洗版：同一個人在同一則貼文只回一次；每個帳號每小時回覆有上限；多句輪替。
 * 這裡只負責「選好回覆」（status ready）並記錄下來，實際送出在 server/utils/inbound.ts 的 deliver。
 */
export async function processComment(boot: Boot, input: Incoming) {
  const db = useDb()
  const account = allAccounts(boot).find(a => a.id === input.accountId)
  if (!account) throw bad('找不到這個帳號')
  const who = input.senderId ? eq(comments.senderId, input.senderId) : eq(comments.author, input.author)
  const answered = inArray(comments.status, ['ready', 'sent'])
  const hourAgo = new Date(Date.now() - 3600_000).toISOString()
  const [rules, earlier, recent] = await db.batch([
    db.select().from(replyRules).where(and(eq(replyRules.groupId, account.groupId), eq(replyRules.enabled, true), eq(replyRules.channel, input.kind))),
    // 這個人之前已經被回過的紀錄
    db.select({ ruleId: comments.ruleId }).from(comments).where(and(
      eq(comments.accountId, input.accountId), who, answered,
      input.externalPostId ? eq(comments.externalPostId, input.externalPostId) : eq(comments.postTitle, input.postTitle ?? ''),
    )),
    db.select({ n: sql<number>`count(*)` }).from(comments).where(and(eq(comments.accountId, input.accountId), answered, gte(comments.createdAt, hourAgo))),
  ])

  const text = input.text.toLowerCase()
  const specificity = (r: typeof rules[number]) => (r.externalPostId || r.postId != null ? 2 : r.accountId != null ? 1 : 0)
  const rule = rules
    .filter(r => (r.accountId == null || r.accountId === input.accountId) && (r.postId == null || r.postId === input.postId))
    // 指定貼文的規則只對那一則貼文底下的留言生效
    .filter(r => !r.externalPostId || r.externalPostId === input.externalPostId)
    .filter(r => r.matchType === 'any' || keywordsOf(r.keywords).some(k => text.includes(k.toLowerCase())))
    // 範圍越小的規則越優先；同範圍時關鍵字規則優先於「任何留言」
    .sort((a, b) => specificity(b) - specificity(a) || Number(a.matchType === 'any') - Number(b.matchType === 'any') || a.id - b.id)[0]

  const base = {
    accountId: input.accountId, kind: input.kind, postTitle: input.postTitle ?? '', author: input.author, text: input.text, createdAt: nowIso(),
    externalId: input.externalId ?? null, externalPostId: input.externalPostId ?? '', senderId: input.senderId ?? '',
  }
  if (!rule) return insert({ ...base, status: 'unmatched', reason: '沒有命中任何規則' })

  const hit = rule.matchType === 'any'
    ? `命中「${rule.name}」（任何留言）`
    : `命中「${rule.name}」（關鍵字「${keywordsOf(rule.keywords).find(k => text.includes(k.toLowerCase()))}」）`
  const matched = { ...base, ruleId: rule.id, ruleName: rule.name }
  if (earlier.length) {
    return insert({ ...matched, status: 'skipped', reason: `${hit}，但這個人在這則貼文已經回過` })
  }
  if (boot.rules.replyPerHour > 0 && (recent[0]?.n ?? 0) >= boot.rules.replyPerHour) {
    return insert({ ...matched, status: 'skipped', reason: `${hit}，但這個帳號這一小時已達上限 ${boot.rules.replyPerHour} 則` })
  }
  const index = rule.cursor % rule.replies.length
  // 留言後私訊只有 Instagram 與 Facebook 做得到；規則掛在整個群組時，其他平台的帳號只回留言
  const withDm = rule.action === 'reply_dm' && (account.platform === 'instagram' || account.platform === 'facebook')
  const [, created] = await db.batch([
    db.update(replyRules).set({ cursor: rule.cursor + 1 }).where(eq(replyRules.id, rule.id)),
    db.insert(comments).values({
      ...matched,
      status: 'ready',
      replyText: rule.replies[index]!,
      dmText: withDm ? rule.dmText : '',
      reason: `${hit}，第 ${index + 1} 句${withDm ? '＋私訊' : ''}`,
    }).returning(),
  ])
  return created[0]!
}

const keywordsOf = (keywords: string) => keywords.split(/[,，、\n]/).map(k => k.trim()).filter(Boolean)

async function insert(values: typeof comments.$inferInsert) {
  const [row] = await useDb().insert(comments).values(values).returning()
  return row!
}

export async function listComments(uid: number) {
  const rows = await useDb().select({ comment: comments }).from(comments)
    .innerJoin(accounts, eq(accounts.id, comments.accountId)).innerJoin(groups, eq(groups.id, accounts.groupId))
    .where(eq(groups.ownerId, uid)).orderBy(desc(comments.createdAt), desc(comments.id)).limit(100)
  return rows.map(r => r.comment)
}
