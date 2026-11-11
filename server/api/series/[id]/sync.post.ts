// 只同步這個系列文裡的貼文：成效數字與留言
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const id = idParam(event)
  await ownedSeries(uid, id)
  return syncSeries(uid, id)
})
