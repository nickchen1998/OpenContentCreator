// 成效總覽的資料：?days=7|28|90
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const requested = Number(getQuery(event).days)
  const days = [7, 28, 90].includes(requested) ? requested : 28
  const [insights, replies] = await Promise.all([loadInsights(uid, days), replyTotals(uid, days)])
  return { ...insights, replies }
})
