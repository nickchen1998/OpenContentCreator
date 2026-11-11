import { accounts, groups, projectGroups, projects, settings } from '../database/schema'

export const DEFAULT_RULES: Rules = { minGapHours: 3, maxPerDay: 2, replyPerHour: 20 }

/** 群組、帳號、專案與協調規則：幾乎每個端點都要用，一趟 batch 讀完。 */
export async function loadBoot(): Promise<Boot> {
  const db = useDb()
  const [groupRows, accountRows, projectRows, grantRows, settingRows] = await db.batch([
    db.select().from(groups).orderBy(groups.id),
    db.select().from(accounts).orderBy(accounts.id),
    db.select({ id: projects.id, name: projects.name, color: projects.color, tokenPrefix: projects.tokenPrefix }).from(projects).orderBy(projects.id),
    db.select().from(projectGroups).orderBy(projectGroups.priority),
    db.select().from(settings),
  ])
  const stored = Object.fromEntries(settingRows.map(r => [r.key, r.value]))
  const rules = { ...DEFAULT_RULES }
  for (const key of Object.keys(rules) as (keyof Rules)[]) {
    const n = Number(stored[key])
    if (Number.isInteger(n) && n >= 0) rules[key] = n
  }
  return {
    groups: groupRows.map(g => ({
      id: g.id,
      name: g.name,
      topic: g.topic,
      accounts: accountRows.filter(a => a.groupId === g.id) as Account[],
    })),
    projects: projectRows.map(p => ({
      ...p,
      color: (isProjectColor(p.color) ? p.color : 'blue'),
      grants: grantRows.filter(r => r.projectId === p.id).map(r => ({ groupId: r.groupId, priority: r.priority, canReadInsights: r.canReadInsights })),
    })),
    rules,
  }
}

export const allAccounts = (boot: Boot) => boot.groups.flatMap(g => g.accounts)
export const accountLabel = (boot: Boot, accountId: number) => {
  for (const g of boot.groups) {
    const a = g.accounts.find(x => x.id === accountId)
    if (a) return `${g.name}・${PLATFORMS[a.platform].label}`
  }
  return '已刪除的帳號'
}
/** 專案在群組內的優先序；自己在網頁上排的（沒有專案）最優先。 */
export function priorityOf(boot: Boot, projectId: number | null, groupId: number) {
  if (projectId == null) return 0
  return boot.projects.find(p => p.id === projectId)?.grants.find(g => g.groupId === groupId)?.priority ?? 999
}
