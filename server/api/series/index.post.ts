import { eq } from 'drizzle-orm'
import { collections } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const body = await bodyOf(event)
  const values = seriesValues(body)
  const db = useDb()
  const [row] = await db.insert(collections).values({ ...values, ownerId: uid, createdAt: nowIso() }).returning({ id: collections.id })
  try {
    await setSeriesPosts(uid, row!.id, body.postIds)
  }
  catch (error) {
    // 貼文放不進去（已經在別的系列文裡）就整筆不建立
    await db.delete(collections).where(eq(collections.id, row!.id))
    throw error
  }
  return { id: row!.id }
})
