import { asc, eq } from 'drizzle-orm'
import { groups, replyRules } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const rows = await useDb().select({ rule: replyRules }).from(replyRules)
    .innerJoin(groups, eq(groups.id, replyRules.groupId)).where(eq(groups.ownerId, uidOf(event))).orderBy(asc(replyRules.id))
  return rows.map(({ rule: { cursor: _, createdAt: __, ...r } }) => r)
})
