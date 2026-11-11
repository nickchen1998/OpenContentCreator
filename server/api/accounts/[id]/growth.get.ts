// 粉絲成長：每成長 step 個粉絲花了幾天、期間發了哪些貼文（儀表板點帳號開的視窗）
export default defineEventHandler(async (event) => {
  const accountId = idParam(event)
  await ownedAccount(uidOf(event), accountId)
  const step = getQuery(event).step
  return loadFollowerGrowth(accountId, step == null ? 100 : int(step, 'step', 10, 1_000_000))
})
