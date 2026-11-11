import { eq } from 'drizzle-orm'
import { collections } from '../../database/schema'

// 更新系列文的設定與貼文
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const id = idParam(event)
  const body = await bodyOf(event)
  await ownedSeries(uid, id)
  const values = seriesValues(body)
  // 先換貼文（可能因為貼文已在別的系列文而失敗），成功才存設定
  if (body.postIds !== undefined) await setSeriesPosts(uid, id, body.postIds)
  await useDb().update(collections).set(values).where(eq(collections.id, id))
  return { ok: true }
})
