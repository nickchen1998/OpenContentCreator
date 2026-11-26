import { eq } from 'drizzle-orm'
import { comments } from '../../../database/schema'

// 補送私訊：留言已經回覆、但私訊當時沒送出去的那種（連不上 Meta 等）。只送私訊，不再回一次留言
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const id = idParam(event)
  await ownedComment(uid, id)
  const [row] = await useDb().select().from(comments).where(eq(comments.id, id))
  if (!row || !dmPending(row)) throw bad('這則沒有待補送的私訊')
  const found = await ownedConnection(uid, row.accountId)
  if (!found || (found.platform !== 'instagram' && found.platform !== 'facebook')) throw bad('這個帳號還沒有連結')
  try {
    return await resendDm(found.platform, found.connection, row)
  }
  catch (e) {
    throw bad(`私訊送出失敗：${(e as Error).message}`.slice(0, 300), 502)
  }
})
