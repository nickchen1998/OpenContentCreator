import { eq } from 'drizzle-orm'
import { loginFailures, users } from '../../database/schema'

// 防爆破：以帳號為 key（不是 IP），帳號不存在也照樣計數，免得用「有沒有被鎖」反推哪些帳號存在。
// 前 5 次不鎖，之後 30 秒起跳、每次翻倍，15 分鐘封頂；登入成功清零；30 分鐘沒有新的失敗就重新計算。
const FREE_TRIES = 5
const RESET_AFTER = 30 * 60_000

export default defineEventHandler(async (event) => {
  const body = await bodyOf(event)
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase().slice(0, 64) : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!username || !password) throw bad('請輸入帳號與密碼')

  const db = useDb()
  const [[user], [failure]] = await db.batch([
    db.select().from(users).where(eq(users.username, username)),
    db.select().from(loginFailures).where(eq(loginFailures.username, username)),
  ])
  const now = Date.now()
  if (failure && failure.lockedUntil > now) {
    const wait = Math.ceil((failure.lockedUntil - now) / 1000)
    setResponseHeader(event, 'Retry-After', wait)
    throw bad(`嘗試太多次，請 ${wait} 秒後再試`, 429)
  }
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    const fails = (failure && now - failure.lastAt < RESET_AFTER ? failure.fails : 0) + 1
    const lock = fails > FREE_TRIES ? Math.min(30_000 * 2 ** (fails - FREE_TRIES - 1), 900_000) : 0
    const values = { username, fails, lockedUntil: now + lock, lastAt: now }
    await db.insert(loginFailures).values(values).onConflictDoUpdate({ target: loginFailures.username, set: values })
    throw bad('帳號或密碼不對', 401)
  }
  if (failure) await db.delete(loginFailures).where(eq(loginFailures.username, username))
  await setUserSession(event, { user: { id: user.id, username: user.username, isAdmin: user.isAdmin } })
  return { ok: true }
})
