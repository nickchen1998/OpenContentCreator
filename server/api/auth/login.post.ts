import { eq } from 'drizzle-orm'
import { settings } from '../../database/schema'

// 防爆破：前 5 次不鎖，之後 30 秒起跳、每次翻倍，15 分鐘封頂；登入成功清零。狀態存 D1 的 settings。
const KEY = 'login_throttle'

export default defineEventHandler(async (event) => {
  const { password } = await bodyOf(event)
  const expected = useRuntimeConfig(event).adminPassword
  if (!expected) throw bad('伺服器還沒設定登入密碼（NUXT_ADMIN_PASSWORD）', 500)

  const db = useDb()
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY))
  const state: { fails: number, until: number } = row ? JSON.parse(row.value) : { fails: 0, until: 0 }
  const now = Date.now()
  if (state.until > now) {
    const wait = Math.ceil((state.until - now) / 1000)
    setResponseHeader(event, 'Retry-After', wait)
    throw bad(`嘗試太多次，請 ${wait} 秒後再試`, 429)
  }
  if (typeof password !== 'string' || !(await safeEqual(password, expected))) {
    const fails = state.fails + 1
    const lock = fails > 5 ? Math.min(30_000 * 2 ** (fails - 6), 900_000) : 0
    const value = JSON.stringify({ fails, until: now + lock })
    await db.insert(settings).values({ key: KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } })
    throw bad('密碼不對', 401)
  }
  if (row) await db.delete(settings).where(eq(settings.key, KEY))
  await setUserSession(event, { user: { name: 'owner' } })
  return { ok: true }
})
