// 單一系列文：設定、貼文與成效、留言紀錄
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const id = idParam(event)
  const [all, comments] = await Promise.all([loadSeries(uid), loadSeriesComments(id)])
  const series = all.find(s => s.id === id)
  if (!series) throw notFound('系列文')
  return { series, comments }
})
