// 一則貼文底下記錄到的留言
export default defineEventHandler(async (event) => {
  const post = await ownedFeedPost(uidOf(event), idParam(event))
  return loadPostReplies(post)
})
