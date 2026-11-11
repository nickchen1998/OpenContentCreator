import { and, eq } from 'drizzle-orm'
import { collectionPosts, comments } from '../../../database/schema'

// 把一則 Threads 貼文放進某個系列文，或拿出來（seriesId: null）。一則貼文只能屬於一個系列文，所以是「換」不是「加」
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const thread = await ownedThread(uid, idParam(event))
  const body = await bodyOf(event)
  const seriesId = body.seriesId == null || body.seriesId === '' ? null : int(body.seriesId, '系列文', 1)
  if (seriesId != null) await ownedSeries(uid, seriesId)
  const db = useDb()
  await batchWrites([
    db.delete(collectionPosts).where(eq(collectionPosts.postId, thread.id)),
    ...(seriesId != null ? [db.insert(collectionPosts).values({ collectionId: seriesId, postId: thread.id })] : []),
    // 這則貼文已經記下的回覆跟著換，系列文成效頁的留言紀錄才對得上
    db.update(comments).set({ collectionId: seriesId }).where(and(eq(comments.accountId, thread.accountId), eq(comments.externalPostId, thread.externalId))),
  ] as any)
  return { seriesId }
})
