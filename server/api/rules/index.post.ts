import { replyRules } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const values = await ruleValues(uidOf(event), await bodyOf(event))
  const [row] = await useDb().insert(replyRules).values({ ...values, createdAt: nowIso() }).returning({ id: replyRules.id })
  return row
})
