import { eq } from 'drizzle-orm'
import { connections } from '../../../database/schema'

// 中斷連結：token 從資料庫刪掉，之後進來的 webhook 會因為找不到連結被丟掉
export default defineEventHandler(async (event) => {
  const accountId = idParam(event)
  await ownedAccount(uidOf(event), accountId)
  await useDb().delete(connections).where(eq(connections.accountId, accountId))
  return { ok: true }
})
