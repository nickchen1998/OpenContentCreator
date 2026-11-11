// 儀表板的資料：?days=7|28|90。貼文拿兩倍的期間回來，前半段用來跟這個期間比較
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const requested = Number(getQuery(event).days)
  const days = [7, 28, 90].includes(requested) ? requested : 28
  const [insights, replies, todo] = await Promise.all([loadInsights(uid, days * 2), replyTotals(uid, days), loadTodo(uid)])
  return { ...insights, replies, todo }
})
