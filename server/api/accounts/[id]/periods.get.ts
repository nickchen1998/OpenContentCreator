// 粉絲成長的期間比較：ranges=2025-10-01:2025-10-31,2026-10-01:2026-10-31（最多 4 段）
export default defineEventHandler(async (event) => {
  const accountId = idParam(event)
  await ownedAccount(uidOf(event), accountId)
  const ranges = String(getQuery(event).ranges ?? '').split(',').filter(Boolean).map((r) => {
    const [from, to] = r.split(':')
    return { from, to }
  })
  return loadFollowerPeriods(accountId, parsePeriods(ranges))
})
