import { eq } from 'drizzle-orm'
import { accounts, projects, userSettings } from '../database/schema'

export const DEFAULT_RULES: Rules = { minGapHours: 3, maxPerDay: 2, replyPerHour: 20 }

/** 伺服器端用的 boot：多帶一個 ownerId，查詢時用來限定在這個會員的資料上 */
export type OwnedBoot = Boot & { ownerId: number }

/**
 * 某個會員的帳號、專案與協調規則：幾乎每個端點都要用，一趟 batch 讀完。
 * 這也是資料隔離的基礎：端點拿到的帳號／專案 id 都要在這份 boot 裡才算數。
 */
export async function loadBoot(uid: number): Promise<OwnedBoot> {
  const db = useDb()
  const [accountRows, projectRows, settingRows] = await db.batch([
    db.select({ id: accounts.id, platform: accounts.platform, name: accounts.name }).from(accounts).where(eq(accounts.ownerId, uid)).orderBy(accounts.id),
    db.select({ id: projects.id, name: projects.name, color: projects.color, tokenPrefix: projects.tokenPrefix, priority: projects.priority, canReadInsights: projects.canReadInsights })
      .from(projects).where(eq(projects.ownerId, uid)).orderBy(projects.priority, projects.id),
    db.select().from(userSettings).where(eq(userSettings.userId, uid)),
  ])
  const stored = Object.fromEntries(settingRows.map(r => [r.key, r.value]))
  const rules = { ...DEFAULT_RULES }
  for (const key of Object.keys(rules) as (keyof Rules)[]) {
    const n = Number(stored[key])
    if (Number.isInteger(n) && n >= 0) rules[key] = n
  }
  return {
    ownerId: uid,
    accounts: accountRows as Account[],
    projects: projectRows.map(p => ({ ...p, color: isProjectColor(p.color) ? p.color : 'blue' })),
    rules,
  }
}

export const accountLabel = (boot: Boot, accountId: number) => {
  const a = boot.accounts.find(x => x.id === accountId)
  return a ? `${PLATFORMS[a.platform].label}・${a.name}` : '已刪除的帳號'
}
/** 專案的優先序；自己在網頁上排的（沒有專案）最優先。 */
export const priorityOf = (boot: Boot, projectId: number | null) =>
  projectId == null ? 0 : boot.projects.find(p => p.id === projectId)?.priority ?? 999
