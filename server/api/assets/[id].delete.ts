import { eq } from 'drizzle-orm'
import { assets } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const [row] = await useDb().delete(assets).where(eq(assets.id, idParam(event))).returning({ key: assets.r2Key })
  if (row) await useMedia().delete(row.key)
  return { ok: true }
})
