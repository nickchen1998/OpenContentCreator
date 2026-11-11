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
  const channel = 'comment' as const // 只有留言規則；私訊自動回覆不做
  // 指定貼文：貼文屬於某一個帳號，所以一定要先選帳號
  const externalPostId = channel === 'comment' ? str(body.externalPostId, '貼文', 100, false) : ''
  if (externalPostId && accountId == null) throw bad('指定貼文前要先選帳號')
  const postLabel = externalPostId ? str(body.postLabel, '貼文', 60, false) : ''
  // 「留言後私訊」只有留言規則有；私訊規則的動作就是回訊息
  const action = channel === 'comment' && body.action === 'reply_dm' ? 'reply_dm' : 'reply'
  const dmText = str(body.dmText, '私訊內容', 1000, action === 'reply_dm')
  return {
    name: str(body.name, '規則名稱', 40), groupId, accountId, postId: channel === 'comment' ? postId : null, channel, externalPostId, postLabel, matchType, keywords, action, replies,
    dmText: action === 'reply_dm' ? dmText : '', enabled: body.enabled !== false,
  } satisfies Partial<typeof replyRules.$inferInsert>
}
