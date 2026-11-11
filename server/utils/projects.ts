import { projectGroups } from '../database/schema'

/** 驗證並整理專案的授權群組 */
export function grantsOf(boot: Boot, value: unknown, projectId: number) {
  if (!Array.isArray(value)) throw bad('授權群組格式不對')
  const seen = new Set<number>()
  return value.map((g: Record<string, unknown>) => {
    const groupId = int(g?.groupId, '群組', 1)
    if (!boot.groups.some(x => x.id === groupId) || seen.has(groupId)) throw bad('授權群組不對')
    seen.add(groupId)
    return { projectId, groupId, priority: int(g.priority ?? 1, '優先序', 1, 99), canReadInsights: g.canReadInsights !== false }
  })
}

export const insertGrants = (rows: (typeof projectGroups.$inferInsert)[]) =>
  rows.map(row => useDb().insert(projectGroups).values(row))
