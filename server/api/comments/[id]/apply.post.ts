import { and, eq } from 'drizzle-orm'
import { accounts, collections, comments } from '../../../database/schema'

// 被防洗版略過的留言（同一個人已經回過、每小時上限）：會員決定還是要回，照系列文「現在」的設定對這一則送一次。
// 每則留言各自可以收一次私訊，所以對方說沒收到、沒看到連結而重留的那一則，可以用這個再送。
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const id = idParam(event)
  await ownedComment(uid, id)
  const db = useDb()
  const [row] = await db.select().from(comments).where(eq(comments.id, id))
  if (!row || row.mine || row.status !== 'skipped') throw bad('這則不是被略過的留言')
  if (!row.externalId) throw bad('這則是手動貼入的，沒辦法由系統送出')
  if (row.collectionId == null) throw bad('這則留言不在系列文裡')
  const [[series], [account]] = await db.batch([
    db.select().from(collections).where(and(eq(collections.id, row.collectionId), eq(collections.ownerId, uid))),
    db.select({ platform: accounts.platform }).from(accounts).where(and(eq(accounts.id, row.accountId), eq(accounts.ownerId, uid))),
  ])
  if (!series || !account) throw notFound('系列文')
  const found = await ownedConnection(uid, row.accountId)
  if (!found || !isLinkedPlatform(found.platform)) throw bad('這個帳號還沒有連結')
  const withDm = Boolean(series.dmText) && (account.platform === 'instagram' || account.platform === 'facebook')
  const withReply = series.replies.length > 0
  if (!withReply && !withDm) throw bad('這個系列文沒有設定回覆或私訊')
  const index = withReply ? series.cursor % series.replies.length : 0
  const [, updated] = await db.batch([
    db.update(collections).set({ cursor: series.cursor + (withReply ? 1 : 0) }).where(eq(collections.id, series.id)),
    db.update(comments).set({
      status: 'ready', error: '',
      replyText: withReply ? series.replies[index]! : '',
      dmText: withDm ? series.dmText : '',
      dmButtonText: withDm ? series.dmButtonText : '',
      dmButtonUrl: withDm ? series.dmButtonUrl : '',
      reason: `手動照設定送出（${[withReply ? `第 ${index + 1} 句` : '', withDm ? '私訊' : ''].filter(Boolean).join('＋')}）`,
    }).where(eq(comments.id, id)).returning(),
  ])
  // 送不出去時留在待送出，畫面上有「重送」
  const result = await deliver(found.platform, found.connection, updated[0]!)
  if (result.status !== 'sent') throw bad(`送出失敗：${result.error}`, 502)
  return result
})
