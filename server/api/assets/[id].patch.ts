import { eq } from 'drizzle-orm'
import { assets } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const body = await bodyOf(event)
  const [row] = await useDb().update(assets).set({ note: str(body.note, '說明', 100, false) }).where(eq(assets.id, idParam(event))).returning({ id: assets.id })
  if (!row) throw notFound('素材')
  return { ok: true }
})
