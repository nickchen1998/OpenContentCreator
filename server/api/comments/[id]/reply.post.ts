import { eq } from 'drizzle-orm'
import { comments } from '../../../database/schema'

// 手動回覆一則留言：會員自己打一句話，由系統送到平台上（串文管理頁用）
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const id = idParam(event)
  await ownedComment(uid, id)
  const text = str((await bodyOf(event)).text, '回覆內容', 500)
  const db = useDb()
  const [row] = await db.select().from(comments).where(eq(comments.id, id))
  if (!row || row.status === 'sent') throw bad('這則已經回覆過了')
  if (!row.externalId) throw bad('這則是手動貼入的，沒辦法由系統送出')
  const found = await ownedConnection(uid, row.accountId)
  if (!found || !isMetaPlatform(found.platform)) throw bad('這個帳號還沒有連結')
  const [ready] = await db.update(comments).set({ status: 'ready', replyText: text, dmText: '', reason: '手動回覆', error: '' }).where(eq(comments.id, id)).returning()
  const result = await deliver(found.platform, found.connection, ready!)
  if (result.status !== 'sent') throw bad(`送出失敗：${result.error}`, 502)
  return result
})
