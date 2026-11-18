// 儀表板的資料：?days=7|28|90、?platform=（只算那個平台的待回覆與私訊；貼文在網頁上篩）。貼文拿兩倍的期間回來，前半段用來跟這個期間比較
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const requested = Number(getQuery(event).days)
  const days = [7, 28, 90].includes(requested) ? requested : 28
  const platform = queryPlatform(event)
  const [insights, replies, todo, followers] = await Promise.all([loadInsights(uid, days * 2), replyTotals(uid, days, platform), loadTodo(uid, platform), loadFollowers(uid, days)])
  return { ...insights, replies, todo, followers }
})
