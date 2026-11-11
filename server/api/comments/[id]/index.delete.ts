import { eq } from 'drizzle-orm'
import { comments } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  await ownedComment(uidOf(event), idParam(event))
  await useDb().delete(comments).where(eq(comments.id, idParam(event)))
  return { ok: true }
})
