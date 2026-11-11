import { eq } from 'drizzle-orm'
import { replyRules } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const id = idParam(event)
  const body = await bodyOf(event)
  await ownedRule(uidOf(event), id)
  // 只切換啟用狀態時不用整筆重送
  const set = Object.keys(body).length === 1 && typeof body.enabled === 'boolean' ? { enabled: body.enabled } : await ruleValues(uidOf(event), body)
  const [row] = await useDb().update(replyRules).set(set).where(eq(replyRules.id, id)).returning({ id: replyRules.id })
  if (!row) throw notFound('規則')
  return row
})
