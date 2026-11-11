import { eq, sql } from 'drizzle-orm'
import { accounts, connections } from '../database/schema'

// 這個會員各帳號的連結狀態（不含 token），以及要填進 Meta App 的 webhook 網址與驗證權杖
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const [rows, hook] = await Promise.all([
    useDb().select({
      accountId: connections.accountId, externalId: connections.externalId, externalName: connections.externalName, autoSend: connections.autoSend,
      tokenExpiresAt: connections.tokenExpiresAt, lastEventAt: connections.lastEventAt, lastError: connections.lastError,
      // 最近一次記下的粉絲數（還沒記過是 null）
      followers: sql<number | null>`(select s.followers from account_stats s where s.account_id = ${connections.accountId} order by s.day desc limit 1)`,
    }).from(connections).innerJoin(accounts, eq(accounts.id, connections.accountId)).where(eq(accounts.ownerId, uid)),
    hookConfig(uid),
  ])
  return { connections: rows, hook: { url: `${getRequestURL(event).origin}/api/hooks/meta/${hook.key}`, verifyToken: hook.verifyToken } }
})
