import { asc } from 'drizzle-orm'
import { users } from '../../database/schema'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return useDb().select({ id: users.id, username: users.username, isAdmin: users.isAdmin, createdAt: users.createdAt }).from(users).orderBy(asc(users.id))
})
