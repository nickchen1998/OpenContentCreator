// 開始連結 YouTube：確認帳號是這個會員的，然後帶去 Google 的同意畫面。
// state 用站方的金鑰加密，裡面是「誰、要連哪個帳號、什麼時候發的」，回來時用來確認不是別人偽造的
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const accountId = Number(getQuery(event).accountId)
  const boot = await loadBoot(uid)
  const account = boot.accounts.find(a => a.id === accountId)
  if (!account || account.platform !== 'youtube') throw notFound('帳號')
  const state = await seal(JSON.stringify({ uid, accountId, at: Date.now() }))
  return sendRedirect(event, youtubeAuthUrl(`${getRequestURL(event).origin}/api/youtube/callback`, state))
})
