import { eq } from 'drizzle-orm'
import { comments } from '../../../database/schema'

// 手動回覆一則留言：會員自己打一句話，由系統送到平台上。同一則可以回不只一次（對話會繼續），所以不走 deliver 的「一筆一句」
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const id = idParam(event)
  await ownedComment(uid, id)
  const text = str((await bodyOf(event)).text, '回覆內容', 500)
  const db = useDb()
  const [row] = await db.select().from(comments).where(eq(comments.id, id))
  if (!row || row.mine) throw bad('不能回覆這一則')
  if (!row.externalId) throw bad('這則是手動貼入的，沒辦法由系統送出')
  const found = await ownedConnection(uid, row.accountId)
  if (!found || !isMetaPlatform(found.platform)) throw bad('這個帳號還沒有連結')
  let sent: any
  try {
    sent = await replyToComment(found.platform, await unseal(found.connection.tokenEnc), found.connection.externalId, row.externalId, text)
  }
  catch (e) {
    throw bad(`送出失敗：${(e as Error).message}`.slice(0, 300), 502)
  }
  await recordOwn(found.connection, {
    externalId: String(sent?.id ?? `manual-${id}-${Date.now()}`), parentExternalId: row.externalId, externalPostId: row.externalPostId, text,
    reason: '手動回覆', collectionId: row.collectionId, postTitle: row.postTitle,
  })
  // 這則就算回過了；原本選好但還沒送的固定回覆不用再送
  if (row.status !== 'sent') await db.update(comments).set({ status: 'sent', replyText: '', dmText: '', error: '', reason: '手動回覆' }).where(eq(comments.id, id))
  return { ok: true }
})
