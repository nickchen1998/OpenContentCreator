// 收進一則留言並跑規則。平台 API 還沒接上，目前由你在網頁上貼進來；之後 webhook 也走同一個流程。
export default defineEventHandler(async (event) => {
  const body = await bodyOf(event)
  const boot = await loadBoot()
  return processComment(boot, {
    accountId: int(body.accountId, '帳號', 1),
    postId: body.postId == null ? null : int(body.postId, '貼文', 1),
    postTitle: str(body.postTitle, '貼文標題', 120, false),
    author: str(body.author, '留言者', 80),
    text: str(body.text, '留言內容', 2000),
  })
})
