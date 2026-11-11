import { and, eq } from 'drizzle-orm'
import { projects } from '../../../database/schema'

// 專案刪掉後 token 立刻失效；它送過的貼文留著，只是不再標示專案
export default defineEventHandler(async (event) => {
  await useDb().delete(projects).where(and(eq(projects.id, idParam(event)), eq(projects.ownerId, uidOf(event))))
  return { ok: true }
})
