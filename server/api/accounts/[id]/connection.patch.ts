import { eq } from 'drizzle-orm'
import { connections } from '../../../database/schema'

// 開關「自動送出」：關掉時只選好回覆，等你按送出
export default defineEventHandler(async (event) => {
  const accountId = idParam(event)
  const { autoSend } = await bodyOf(event)
  if (typeof autoSend !== 'boolean') throw bad('狀態不對')
  if (!(await ownedConnection(uidOf(event), accountId))) throw notFound('連結')
  await useDb().update(connections).set({ autoSend }).where(eq(connections.accountId, accountId))
  return { ok: true }
})
