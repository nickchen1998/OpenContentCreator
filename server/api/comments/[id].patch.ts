import { eq } from 'drizzle-orm'
import { comments } from '../../database/schema'

// ready → sent（你已把固定回覆貼出去）；unmatched / skipped → handled（你自己處理了）
export default defineEventHandler(async (event) => {
  const { status } = await bodyOf(event)
  await ownedComment(uidOf(event), idParam(event))
  if (status !== 'sent' && status !== 'handled') throw bad('狀態不對')
  const [row] = await useDb().update(comments).set({ status }).where(eq(comments.id, idParam(event))).returning()
  if (!row) throw notFound('留言')
  return row
})
