import { and, asc, eq, isNotNull, lt, sql } from 'drizzle-orm'
import { accountPosts, accounts, collectionPosts, comments, connections } from '../database/schema'

type Connection = typeof connections.$inferSelect
/**
 * 同步一個帳號的貼文與成效：列出最近的貼文（1 個請求，按讚與留言數跟著回來），再替最久沒更新的幾則抓 insight
 * （觀看、分享、收藏；每則 1–2 個請求）。insightBudget 是這次最多替幾則貼文抓 insight，呼叫端用它控制請求數。
 */
export async function syncAccountPosts(platform: MetaPlatform, connection: Connection, insightBudget: number, ownerId?: number) {
  const db = useDb()
  const now = nowIso()
  try {
    const token = await unseal(connection.tokenEnc)
    const remote = await listPostsWithStats(platform, token, connection.externalId)
    const known = new Map((await db.select({ externalId: accountPosts.externalId, insightsAt: accountPosts.insightsAt }).from(accountPosts)
      .where(eq(accountPosts.accountId, connection.accountId))).map(r => [r.externalId, r.insightsAt]))
    // 新貼文數字變動快，先抓還沒抓過的，再抓最久沒更新的；兩個月前的貼文不再更新 insight
    const cutoff = new Date(Date.now() - 60 * 86400_000).toISOString()
    const queue = remote.filter(p => p.publishedAt >= cutoff)
      .sort((a, b) => (known.get(a.id) ?? '').localeCompare(known.get(b.id) ?? '') || b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, Math.max(0, insightBudget))
    const insights = new Map<string, Partial<Metrics>>()
    let insightError = ''
    for (const post of queue) {
      try {
        insights.set(post.id, await fetchInsights(platform, token, post.id))
      }
      catch (e) {
        insightError = (e as Error).message
        // 權限不足這類錯誤每一則都會一樣，不用繼續浪費請求
        if (/permission|\(#10\)|\(#200\)/i.test(insightError)) break
      }
    }
    await batchWrites(remote.map((post) => {
      const extra = insights.get(post.id)
      // 只寫這次真的拿到的數字，沒拿到的保留資料庫裡的舊值
      const metrics = Object.fromEntries(Object.entries({ likes: post.likes, comments: post.comments, shares: post.shares, ...extra }).filter(([, v]) => v !== undefined))
      const base = { url: post.url, text: post.text, publishedAt: post.publishedAt, ...metrics, ...(extra ? { insightsAt: now } : {}) }
      return db.insert(accountPosts).values({ accountId: connection.accountId, externalId: post.id, ...base })
        .onConflictDoUpdate({ target: [accountPosts.accountId, accountPosts.externalId], set: base })
    }))
    // 系列文裡的貼文順便補抓既有留言（只記錄，不自動回覆）
    const commentError = ownerId != null && platform !== 'threads' ? await importSeriesComments(platform, connection, token, ownerId) : ''
    const lastError = (insightError ? `讀不到觀看數等成效：${insightError}` : commentError).slice(0, 300)
    await db.update(connections).set({ lastSyncedAt: now, lastError }).where(eq(connections.id, connection.id))
    return { posts: remote.length, error: lastError }
  }
  catch (e) {
    const error = `同步貼文失敗：${(e as Error).message}`.slice(0, 300)
    await db.update(connections).set({ lastSyncedAt: now, lastError: error }).where(eq(connections.id, connection.id))
    return { posts: 0, error }
  }
}

/**
 * 補抓系列文裡各貼文的既有留言：系列文建立之前就有的留言、或即時通知漏掉的。
 * 跑一樣的規則，但**不自動送出**：命中的會是「待送出」，由會員自己決定要不要回（否則把一篇有上百則留言的貼文
 * 加進系列文，會一口氣對所有人回覆加私訊）。每次最多看 4 則貼文、收 12 則新留言，其餘下次同步再收。
 */
async function importSeriesComments(platform: 'instagram' | 'facebook', connection: Connection, token: string, ownerId: number) {
  const db = useDb()
  try {
    const [targets, seenRows] = await db.batch([
      db.select({ externalId: accountPosts.externalId }).from(accountPosts)
        .innerJoin(collectionPosts, eq(collectionPosts.postId, accountPosts.id))
        .where(eq(accountPosts.accountId, connection.accountId)).orderBy(sql`${accountPosts.publishedAt} desc`).limit(4),
      db.select({ externalId: comments.externalId }).from(comments)
        .where(and(eq(comments.accountId, connection.accountId), isNotNull(comments.externalId))).orderBy(sql`${comments.id} desc`).limit(1000),
    ])
    if (!targets.length) return ''
    // 貼文加進系列文之前就記下的留言，補上所屬的系列文，留言紀錄才看得到
    await db.run(sql`update comments set collection_id = (
      select cp.collection_id from collection_posts cp join account_posts p on p.id = cp.post_id
      where p.account_id = comments.account_id and p.external_id = comments.external_post_id
    ) where account_id = ${connection.accountId} and collection_id is null and external_post_id != ''`)
    const seen = new Set(seenRows.map(r => r.externalId))
    let boot: OwnedBoot | undefined
    let imported = 0
    for (const target of targets) {
      const remote = await listPostComments(platform, token, target.externalId)
      // 自己的留言（包含我們送出的回覆）不算；舊的先處理，「同一個人只回一次」才會算在他最早的那則上
      const fresh = remote.filter(c => c.text.trim() && !seen.has(c.id) && c.senderId !== connection.externalId && c.author !== `@${connection.externalName}`).reverse()
      for (const c of fresh) {
        if (imported >= 12) return ''
        boot ??= await loadBoot(ownerId)
        await processComment(boot, { accountId: connection.accountId, externalId: c.id, externalPostId: target.externalId, senderId: c.senderId, author: c.author, text: c.text, at: c.at })
          .catch((e) => { if (!/UNIQUE/i.test(String((e as Error)?.cause ?? e))) throw e })
        imported += 1
      }
    }
    return ''
  }
  catch (e) {
    return `讀不到留言：${(e as Error).message}`
  }
}

/** 排程：同步最久沒輪到的幾個帳號。2 個帳號 × (1 + 8 則 × 最多 2 個請求) 在 Free 方案的 50 個對外請求以內 */
export async function syncStaleAccounts(maxConnections = 2) {
  const due = await useDb().select({ connection: connections, platform: accounts.platform, ownerId: accounts.ownerId }).from(connections)
    .innerJoin(accounts, eq(accounts.id, connections.accountId))
    .orderBy(sql`${connections.lastSyncedAt} is not null`, asc(connections.lastSyncedAt))
    .limit(maxConnections)
  for (const { connection, platform, ownerId } of due) {
    // 每則貼文的 insight 1–2 個請求、補抓留言每則貼文 1 個，兩個帳號合計壓在 50 個以內
    if (isMetaPlatform(platform)) await syncAccountPosts(platform, connection, 6, ownerId)
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
  const due = await db.select({ connection: connections, ownerId: accounts.ownerId }).from(connections)
    .innerJoin(accounts, eq(accounts.id, connections.accountId))
    .where(eq(accounts.platform, 'threads'))
    .orderBy(sql`${connections.lastPolledAt} is not null`, asc(connections.lastPolledAt))
    .limit(maxConnections)
  for (const { connection, ownerId } of due) {
    await db.update(connections).set({ lastPolledAt: nowIso() }).where(eq(connections.id, connection.id))
    try {
      const token = await unseal(connection.tokenEnc)
      const threads = await listRecentPosts('threads', token, connection.externalId, 5)
      // 已經收過的回覆一次查出來，不要每則回覆查一次（Free 方案每次 50 個 D1 查詢）
      const seen = new Set((await db.select({ externalId: comments.externalId }).from(comments)
        .where(and(eq(comments.accountId, connection.accountId), isNotNull(comments.externalId)))
        .orderBy(sql`${comments.id} desc`).limit(500)).map(r => r.externalId))
      let boot: OwnedBoot | undefined
      for (const thread of threads) {
        const replies = await listThreadReplies(token, thread.id)
        // 連結之前就在的舊回覆不補回，否則一連結就會對歷史留言洗一輪
        const fresh = replies.filter(r => !seen.has(r.id) && r.timestamp && new Date(r.timestamp).toISOString() > connection.createdAt).reverse()
        for (const reply of fresh.slice(0, 5)) {
          boot ??= await loadBoot(ownerId)
          await receive(boot, 'threads', connection, {
            externalId: reply.id, senderId: reply.username, author: `@${reply.username}`, text: reply.text,
            externalPostId: thread.id,
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
