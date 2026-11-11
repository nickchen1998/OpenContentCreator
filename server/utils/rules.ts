import { eq } from 'drizzle-orm'
import { posts, replyRules } from '../database/schema'

export async function ruleValues(uid: number, body: Record<string, unknown>) {
  const boot = await loadBoot(uid)
  const groupId = int(body.groupId, '群組', 1)
  const group = boot.groups.find(g => g.id === groupId)
  if (!group) throw bad('找不到這個群組')
  const accountId = body.accountId == null ? null : int(body.accountId, '帳號', 1)
  if (accountId != null && !group.accounts.some(a => a.id === accountId)) throw bad('帳號不在這個群組裡')
  const postId = body.postId == null ? null : int(body.postId, '貼文', 1)
  if (postId != null) {
    const [post] = await useDb().select({ groupId: posts.groupId }).from(posts).where(eq(posts.id, postId))
    if (post?.groupId !== groupId) throw bad('貼文不在這個群組裡')
  }
  const matchType = body.matchType === 'any' ? 'any' : 'keyword'
  const keywords = str(body.keywords, '關鍵字', 200, matchType === 'keyword')
  const replies = (Array.isArray(body.replies) ? body.replies : []).map(r => str(r, '回覆內容', 500, false)).filter(Boolean)
  if (!replies.length) throw bad('請至少寫一句固定回覆')
  if (replies.length > 20) throw bad('固定回覆最多 20 句')
  const action = body.action === 'reply_dm' ? 'reply_dm' : 'reply'
  const dmText = str(body.dmText, '私訊內容', 1000, action === 'reply_dm')
  return {
    name: str(body.name, '規則名稱', 40), groupId, accountId, postId, matchType, keywords, action, replies,
    dmText: action === 'reply_dm' ? dmText : '', enabled: body.enabled !== false,
  } satisfies Partial<typeof replyRules.$inferInsert>
}
