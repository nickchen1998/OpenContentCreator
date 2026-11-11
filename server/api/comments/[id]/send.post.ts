import { eq } from 'drizzle-orm'
import { comments } from '../../../database/schema'

// 手動送出（或重送）一則已選好回覆的留言／私訊
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const id = idParam(event)
  await ownedComment(uid, id)
  const [row] = await useDb().select().from(comments).where(eq(comments.id, id))
  if (!row || row.status !== 'ready') throw bad('這則沒有待送出的回覆')
  if (!row.externalId) throw bad('這則是手動貼入的，沒辦法由系統送出')
  const found = await ownedConnection(uid, row.accountId)
  if (!found || !isLinkedPlatform(found.platform)) throw bad('這個帳號還沒有連結')
  const result = await deliver(found.platform, found.connection, row)
  if (result.status !== 'sent') throw bad(`送出失敗：${result.error}`, 502)
  return result
})
