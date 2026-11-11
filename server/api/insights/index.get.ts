// 成效總覽的資料：?days=7|28|90
export default defineEventHandler((event) => {
  const days = Number(getQuery(event).days)
  return loadInsights(uidOf(event), [7, 28, 90].includes(days) ? days : 28)
})
