import { eq } from 'drizzle-orm'
import { projects } from '../../../database/schema'

// 重新產生 token：舊的立刻失效
export default defineEventHandler(async (event) => {
  const { token, tokenHash, tokenPrefix } = await newProjectToken()
  const [row] = await useDb().update(projects).set({ tokenHash, tokenPrefix }).where(eq(projects.id, idParam(event))).returning({ id: projects.id })
  if (!row) throw notFound('專案')
  return { id: row.id, token }
})
