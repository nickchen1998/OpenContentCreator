import { and, asc, eq, gte, isNotNull, lt, ne, sql } from 'drizzle-orm'
import { accounts, comments, connections, groups, posts, postTargets } from '../database/schema'

type Connection = typeof connections.$inferSelect
interface SyncTarget { id: number, publishedUrl: string, externalPostId: string }

/**
 * 同步一個帳號底下幾則貼文的成效：先把「貼上的發文連結」對到平台上的貼文 id（對過的會記下來），再抓 insight。
 * 每則貼文 1–3 個對外請求；對連結另外要 1 個。呼叫端要自己控制筆數（Free 方案每次 50 個對外請求）。
 */
export async function syncTargets(platform: MetaPlatform, connection: Connection, targets: SyncTarget[]) {
  const db = useDb()
  const results: { id: number, error: string }[] = []
  let token: string
  let recent: RemotePost[] | undefined
  try {
    token = await unseal(connection.tokenEnc)
  }
  catch (e) {
    return targets.map(t => ({ id: t.id, error: (e as Error).message }))
  }
  for (const target of targets) {
    let error = ''
    try {
      let postId = target.externalPostId
      if (!postId) {
        recent ??= await listRecentPosts(platform, token, connection.externalId)
        postId = matchPost(platform, target.publishedUrl, recent)?.id ?? ''
        if (!postId) throw new Error('在這個帳號最近 50 則貼文裡找不到這個連結')
      }
      const metrics = await fetchMetrics(platform, token, postId)
      await db.update(postTargets).set({ ...metrics, externalPostId: postId, syncError: '', metricsUpdatedAt: nowIso() }).where(eq(postTargets.id, target.id))
    }
    catch (e) {
      error = (e as Error).message.slice(0, 300)
      // 失敗也更新時間，排程才會輪到下一則，不會卡在同一則
      await db.update(postTargets).set({ syncError: error, metricsUpdatedAt: nowIso() }).where(eq(postTargets.id, target.id))
    }
    results.push({ id: target.id, error })
  }
  return results
}

/** 排程：同步最久沒更新的幾則（近 30 天內、已貼上連結、帳號已連結） */
export async function syncStaleTargets(limit = 10) {
  const db = useDb()
  const since = `${addDays(todayTaipei(), -30)}T00:00`
  const rows = await db.select({ target: { id: postTargets.id, publishedUrl: postTargets.publishedUrl, externalPostId: postTargets.externalPostId }, connection: connections, platform: accounts.platform })
    .from(postTargets)
    .innerJoin(posts, eq(posts.id, postTargets.postId))
    .innerJoin(connections, eq(connections.accountId, postTargets.accountId))
    .innerJoin(accounts, eq(accounts.id, postTargets.accountId))
    .where(and(ne(postTargets.publishedUrl, ''), eq(posts.status, 'scheduled'), gte(posts.scheduledAt, since)))
    .orderBy(sql`${postTargets.metricsUpdatedAt} is not null`, asc(postTargets.metricsUpdatedAt))
    .limit(limit)
  const byConnection = new Map<number, { connection: Connection, platform: string, targets: SyncTarget[] }>()
  for (const r of rows) {
    const entry = byConnection.get(r.connection.id) ?? { connection: r.connection, platform: r.platform, targets: [] }
    entry.targets.push(r.target)
    byConnection.set(r.connection.id, entry)
  }
  for (const { connection, platform, targets } of byConnection.values()) {
    if (isMetaPlatform(platform)) await syncTargets(platform, connection, targets)
  }
}

/** 排程：把快到期的 Instagram／Threads token 換新。沒換的話 60 天後自動回覆會默默停掉 */
export async function refreshExpiringTokens(limit = 20) {
  const db = useDb()
  const soon = new Date(Date.now() + 20 * 86400_000).toISOString()
  const due = await db.select({ connection: connections, platform: accounts.platform }).from(connections)
    .innerJoin(accounts, eq(accounts.id, connections.accountId))
    .where(and(isNotNull(connections.tokenExpiresAt), lt(connections.tokenExpiresAt, soon)))
    .limit(limit)
  for (const { connection, platform } of due) {
    if (platform !== 'instagram' && platform !== 'threads') continue
    try {
      const fresh = await refreshToken(platform, await unseal(connection.tokenEnc))
      await db.update(connections).set({ tokenEnc: await seal(fresh.token), tokenExpiresAt: fresh.expiresAt }).where(eq(connections.id, connection.id))
    }
    catch (e) {
      await db.update(connections).set({ lastError: `Token 換新失敗：${(e as Error).message}`.slice(0, 300) }).where(eq(connections.id, connection.id))
    }
  }
}

/**
 * 排程：輪詢 Threads 的新回覆（Threads 的 webhook 要過 App Review，會員自己的 App 收不到）。
 * 每次處理最久沒輪到的幾個帳號；每個帳號看最近 5 則貼文，只處理連結之後才出現、而且還沒收過的回覆。
 */
export async function pollThreads(maxConnections = 3) {
  const db = useDb()
  const due = await db.select({ connection: connections, ownerId: groups.ownerId }).from(connections)
    .innerJoin(accounts, eq(accounts.id, connections.accountId)).innerJoin(groups, eq(groups.id, accounts.groupId))
    .where(eq(accounts.platform, 'threads'))
    .orderBy(sql`${connections.lastPolledAt} is not null`, asc(connections.lastPolledAt))
    .limit(maxConnections)
  for (const { connection, ownerId } of due) {
    if (ownerId == null) continue
    await db.update(connections).set({ lastPolledAt: nowIso() }).where(eq(connections.id, connection.id))
    try {
      const token = await unseal(connection.tokenEnc)
      const threads = await listRecentPosts('threads', token, connection.externalId, 5)
      // 已經收過的回覆一次查出來，不要每則回覆查一次（Free 方案每次 50 個 D1 查詢）
      const seen = new Set((await db.select({ externalId: comments.externalId }).from(comments)
        .where(and(eq(comments.accountId, connection.accountId), isNotNull(comments.externalId)))
        .orderBy(sql`${comments.id} desc`).limit(500)).map(r => r.externalId))
      let boot: Boot | undefined
      for (const thread of threads) {
        const replies = await listThreadReplies(token, thread.id)
        // 連結之前就在的舊回覆不補回，否則一連結就會對歷史留言洗一輪
        const fresh = replies.filter(r => !seen.has(r.id) && r.timestamp && new Date(r.timestamp).toISOString() > connection.createdAt).reverse()
        for (const reply of fresh.slice(0, 5)) {
          boot ??= await loadBoot(ownerId)
          await receive(boot, 'threads', connection, {
            kind: 'comment', externalId: reply.id, senderId: reply.username, author: `@${reply.username}`, text: reply.text,
            externalPostId: thread.id, postTitle: thread.text,
          })
        }
      }
      if (connection.lastError) await db.update(connections).set({ lastError: '' }).where(eq(connections.id, connection.id))
    }
    catch (e) {
      await db.update(connections).set({ lastError: `讀取 Threads 回覆失敗：${(e as Error).message}`.slice(0, 300) }).where(eq(connections.id, connection.id))
    }
  }
}
