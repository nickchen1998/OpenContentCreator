import { eq } from 'drizzle-orm'
import { accounts, connections } from '../../database/schema'

// 立刻同步這個會員所有已連結帳號的貼文與成效。Free 方案一個請求最多 50 個對外請求，所以把額度平均分給各帳號
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const rows = await useDb().select({ connection: connections, platform: accounts.platform }).from(connections)
    .innerJoin(accounts, eq(accounts.id, connections.accountId))
    .where(eq(accounts.ownerId, uid))
  const usable = rows.filter(r => isLinkedPlatform(r.platform)).slice(0, 8)
  if (!usable.length) throw bad('還沒有連結任何帳號')
  // 每個帳號：列貼文 1 個請求、補抓留言最多 4 個，剩下的額度給 insight（每則最多 2 個）
  const budget = Math.max(1, Math.floor((44 - usable.length * 5) / (usable.length * 2)))
  const errors: string[] = []
  for (const r of usable) {
    const result = await syncAccountPosts(r.platform as LinkedPlatform, r.connection, budget, uid)
    if (result.error) errors.push(`${r.connection.externalName}：${result.error}`)
  }
  return { errors }
})
