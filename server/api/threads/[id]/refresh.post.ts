// 點開一則 Threads 貼文時，立刻向 Threads 抓這一則底下的整串對話（不用等每 5 分鐘那一輪），再回傳最新的紀錄。
// warning 是「整串讀不到、只抓到第一層」的原因，頁面會顯示出來
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const thread = await ownedThread(uid, idParam(event))
  const found = await ownedConnection(uid, thread.accountId)
  if (!found) return { rows: await loadThreadReplies(thread), warning: '' }
  let warning = ''
  try {
    warning = await importThreadConversations(found.connection, uid, [{ id: thread.externalId, text: thread.text, inSeries: thread.seriesId }], 8)
  }
  catch (e) {
    warning = `讀取 Threads 回覆失敗：${(e as Error).message}`.slice(0, 300)
  }
  return { rows: await loadThreadReplies(thread), warning }
})
