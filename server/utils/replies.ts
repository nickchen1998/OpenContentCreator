import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { accounts, comments, groups, replyRules } from '../database/schema'

export interface IncomingComment { accountId: number, postId?: number | null, postTitle: string, author: string, text: string }

/**
 * 固定回覆的規則引擎。只有命中規則的留言會得到一句事先寫好的回覆，沒命中的不處理。
 * 防洗版：同一位留言者在同一則貼文只回一次；每個帳號每小時回覆有上限；多句輪替。
 * 平台 API 尚未接上，所以這裡只「選好回覆」（status ready），由人貼上後標示為已回覆。
 * 之後接上各平台的 webhook／輪詢時，呼叫同一個函式，再把 ready 的回覆送出去即可。
 */
export async function processComment(boot: Boot, input: IncomingComment) {
  const db = useDb()
  const account = allAccounts(boot).find(a => a.id === input.accountId)
  if (!account) throw bad('找不到這個帳號')
  const hourAgo = new Date(Date.now() - 3600_000).toISOString()
  const [rules, earlier, recent] = await db.batch([
    db.select().from(replyRules).where(and(eq(replyRules.groupId, account.groupId), eq(replyRules.enabled, true))),
    db.select({ id: comments.id }).from(comments).where(and(
      eq(comments.accountId, input.accountId), eq(comments.postTitle, input.postTitle), eq(comments.author, input.author),
      inArray(comments.status, ['ready', 'sent']),
    )).limit(1),
    db.select({ n: sql<number>`count(*)` }).from(comments).where(and(
      eq(comments.accountId, input.accountId), inArray(comments.status, ['ready', 'sent']), gte(comments.createdAt, hourAgo),
    )),
  ])

  const text = input.text.toLowerCase()
  const specificity = (r: typeof rules[number]) => (r.postId != null ? 2 : r.accountId != null ? 1 : 0)
  const rule = rules
    .filter(r => (r.accountId == null || r.accountId === input.accountId) && (r.postId == null || r.postId === input.postId))
    .filter(r => r.matchType === 'any' || keywordsOf(r.keywords).some(k => text.includes(k.toLowerCase())))
    // 範圍越小的規則越優先；同範圍時關鍵字規則優先於「任何留言」
    .sort((a, b) => specificity(b) - specificity(a) || Number(a.matchType === 'any') - Number(b.matchType === 'any') || a.id - b.id)[0]

  const base = { accountId: input.accountId, postTitle: input.postTitle, author: input.author, text: input.text, createdAt: nowIso() }
  if (!rule) {
    return insert({ ...base, status: 'unmatched', reason: '沒有命中任何規則，系統不會回覆，留給你親自處理。' })
  }
  const hit = rule.matchType === 'any'
    ? `命中「${rule.name}」：這個範圍的任何留言都會觸發。`
    : `命中「${rule.name}」：留言含關鍵字「${keywordsOf(rule.keywords).find(k => text.includes(k.toLowerCase()))}」。`
  const matched = { ...base, ruleId: rule.id, ruleName: rule.name }
  if (earlier.length) {
    return insert({ ...matched, status: 'skipped', reason: `${hit}但同一位留言者在這則貼文已經回覆過，不再重複回。` })
  }
  if (boot.rules.replyPerHour > 0 && (recent[0]?.n ?? 0) >= boot.rules.replyPerHour) {
    return insert({ ...matched, status: 'skipped', reason: `${hit}但這個帳號這一小時的回覆已達上限（${boot.rules.replyPerHour} 則），暫停到下個小時。` })
  }
  const index = rule.cursor % rule.replies.length
  const [, created] = await db.batch([
    db.update(replyRules).set({ cursor: rule.cursor + 1 }).where(eq(replyRules.id, rule.id)),
    db.insert(comments).values({
      ...matched,
      status: 'ready',
      replyText: rule.replies[index]!,
      dmText: rule.action === 'reply_dm' ? rule.dmText : '',
      reason: `${hit}使用第 ${index + 1} 句輪替內容${rule.action === 'reply_dm' ? '，並附上私訊內容' : ''}。`,
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
