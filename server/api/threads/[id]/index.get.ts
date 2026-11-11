// 一則 Threads 貼文底下的回覆
export default defineEventHandler(async (event) => {
  const thread = await ownedThread(uidOf(event), idParam(event))
  return loadThreadReplies(thread)
})
