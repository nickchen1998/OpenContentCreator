import { and, eq } from 'drizzle-orm'
import { userSettings } from '../database/schema'

// 每個會員一組 webhook 網址（/api/hooks/meta/<key>）與驗證權杖，填進他自己的 Meta App。
// 第一次用到時才產生，存在 user_settings。
const KEY = 'metaHookKey'
const VERIFY = 'metaVerifyToken'

export async function hookConfig(uid: number) {
  const db = useDb()
  const rows = await db.select().from(userSettings).where(eq(userSettings.userId, uid))
  let key = rows.find(r => r.key === KEY)?.value
  let verifyToken = rows.find(r => r.key === VERIFY)?.value
  if (!key || !verifyToken) {
    key = randomKey()
    verifyToken = randomKey(16)
    await db.batch([
      db.insert(userSettings).values({ userId: uid, key: KEY, value: key }).onConflictDoUpdate({ target: [userSettings.userId, userSettings.key], set: { value: key } }),
      db.insert(userSettings).values({ userId: uid, key: VERIFY, value: verifyToken }).onConflictDoUpdate({ target: [userSettings.userId, userSettings.key], set: { value: verifyToken } }),
    ])
  }
  return { key, verifyToken }
}

/** 網址裡的 key 是哪個會員的 */
export async function hookOwner(key: string) {
  if (!/^[0-9a-f]{48}$/.test(key)) return
  const db = useDb()
  const [owner] = await db.select({ userId: userSettings.userId }).from(userSettings).where(and(eq(userSettings.key, KEY), eq(userSettings.value, key)))
  if (!owner) return
  const [verify] = await db.select({ value: userSettings.value }).from(userSettings).where(and(eq(userSettings.userId, owner.userId), eq(userSettings.key, VERIFY)))
  return { uid: owner.userId, verifyToken: verify?.value ?? '' }
}
