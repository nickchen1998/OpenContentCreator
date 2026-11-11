import { replyRules } from '../database/schema'

export async function ruleValues(uid: number, body: Record<string, unknown>) {
  const boot = await loadBoot(uid)
  const accountId = body.accountId == null ? null : int(body.accountId, '帳號', 1)
  if (accountId != null && !boot.accounts.some(a => a.id === accountId)) throw bad('找不到這個帳號')
  // 指定貼文：貼文屬於某一個帳號，所以一定要先選帳號
  const externalPostId = str(body.externalPostId, '貼文', 100, false)
  if (externalPostId && accountId == null) throw bad('指定貼文前要先選帳號')
  const postLabel = externalPostId ? str(body.postLabel, '貼文', 60, false) : ''
  const matchType = body.matchType === 'any' ? 'any' : 'keyword'
  const keywords = str(body.keywords, '關鍵字', 200, matchType === 'keyword')
  const replies = (Array.isArray(body.replies) ? body.replies : []).map(r => str(r, '回覆內容', 500, false)).filter(Boolean)
  if (!replies.length) throw bad('請至少寫一句固定回覆')
  if (replies.length > 20) throw bad('固定回覆最多 20 句')
  const action = body.action === 'reply_dm' ? 'reply_dm' : 'reply'
  const dmText = str(body.dmText, '私訊內容', 1000, action === 'reply_dm')
  return {
    name: str(body.name, '規則名稱', 40), accountId, externalPostId, postLabel, matchType, keywords, action, replies,
    dmText: action === 'reply_dm' ? dmText : '', enabled: body.enabled !== false,
  } satisfies Partial<typeof replyRules.$inferInsert>
}
