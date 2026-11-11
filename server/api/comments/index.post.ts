// 手動貼入一則留言或私訊並跑規則（還沒連結平台的帳號，或想試規則時用）。連結後由 webhook 自動進來，走同一個流程。
export default defineEventHandler(async (event) => {
  const body = await bodyOf(event)
  const boot = await loadBoot(uidOf(event))
  return processComment(boot, {
    accountId: int(body.accountId, '帳號', 1),
    kind: 'comment',
    postId: body.postId == null ? null : int(body.postId, '貼文', 1),
    postTitle: str(body.postTitle, '貼文標題', 120, false),
    externalPostId: str(body.externalPostId, '貼文', 100, false) || undefined,
    author: str(body.author, '留言者', 80),
    text: str(body.text, '留言內容', 2000),
  })
})
