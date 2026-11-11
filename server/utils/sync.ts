import { and, asc, desc, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm'
import { accountPosts, accounts, collectionPosts, comments, connections } from '../database/schema'

type Connection = typeof connections.$inferSelect
/**
 * 同步一個帳號的貼文與成效：列出最近的貼文（1 個請求，按讚與留言數跟著回來），再替最久沒更新的幾則抓 insight
 * （觀看、分享、收藏；每則 1–2 個請求）。insightBudget 是這次最多替幾則貼文抓 insight，呼叫端用它控制請求數。
 */
export async function syncAccountPosts(platform: LinkedPlatform, connection: Connection, insightBudget: number, ownerId?: number) {
  const db = useDb()
  const now = nowIso()
  try {
    const token = await unseal(connection.tokenEnc)
    const listed = await listPostsWithStats(platform, token, connection.externalId)
    const remote = listed.filter(p => !p.repost && !p.skip)
    const reposts = listed.filter(p => p.repost || p.skip).map(p => p.id)
    const known = new Map((await db.select({ externalId: accountPosts.externalId, insightsAt: accountPosts.insightsAt }).from(accountPosts)
      .where(eq(accountPosts.accountId, connection.accountId))).map(r => [r.externalId, r.insightsAt]))
    // 新貼文數字變動快，先抓還沒抓過的，再抓最久沒更新的；兩個月前的貼文不再更新 insight
    const cutoff = new Date(Date.now() - 60 * 86400_000).toISOString()
    const queue = remote.filter(p => p.publishedAt >= cutoff)
      .sort((a, b) => (known.get(a.id) ?? '').localeCompare(known.get(b.id) ?? '') || b.publishedAt.localeCompare(a.publishedAt))
      // YouTube 列影片時數字就齊了，不用逐支再查
      .slice(0, platform === 'youtube' ? 0 : Math.max(0, insightBudget))
    const insights = new Map<string, Partial<Metrics>>()
    let insightError = ''
    for (const post of queue) {
      try {
        insights.set(post.id, await fetchInsights(platform as MetaPlatform, token, post.id))
      }
      catch (e) {
        insightError = (e as Error).message
        // 權限不足這類錯誤每一則都會一樣，不用繼續浪費請求
        if (/permission|\(#10\)|\(#200\)/i.test(insightError)) break
      }
    }
    // 先前把轉發、或還沒公開的影片收進來的，清掉（留言紀錄不受影響）
    if (reposts.length) await db.delete(accountPosts).where(and(eq(accountPosts.accountId, connection.accountId), sql`${accountPosts.externalId} in (select value from json_each(${JSON.stringify(reposts)}))`))
    await batchWrites([...remote.map((post) => {
      const extra = insights.get(post.id)
      // 只寫這次真的拿到的數字，沒拿到的保留資料庫裡的舊值
      const metrics = Object.fromEntries(Object.entries({ views: post.views, likes: post.likes, comments: post.comments, shares: post.shares, ...extra }).filter(([, v]) => v !== undefined))
      const base = { url: post.url, text: post.text, publishedAt: post.publishedAt, ...metrics, ...(extra || post.views !== undefined ? { insightsAt: now } : {}) }
      return db.insert(accountPosts).values({ accountId: connection.accountId, externalId: post.id, ...base })
        .onConflictDoUpdate({ target: [accountPosts.accountId, accountPosts.externalId], set: base })
    }),
    // 這次列到的貼文，把更新完的數字記成今天的一筆（成長趨勢用）
    ...(remote.length ? [snapshotPostStats(sql`${accountPosts.accountId} = ${connection.accountId} and ${accountPosts.externalId} in (select value from json_each(${JSON.stringify(remote.map(p => p.id))}))`)] : [])])
    // 粉絲數一天記一次（今天記過就不會再打平台）
    const followerError = await recordFollowers(platform, connection, token).catch(e => `讀不到粉絲數：${(e as Error).message}`)
    // 系列文裡的貼文順便補抓既有留言（只記錄，不自動回覆）
    const commentError = ownerId != null && (platform === 'instagram' || platform === 'facebook') ? await importSeriesComments(platform, connection, token, ownerId) : ''
    const lastError = (insightError ? `讀不到觀看數等成效：${insightError}` : commentError || followerError).slice(0, 300)
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
 * 補抓貼文的既有留言（預設是這個帳號最新幾則系列文貼文；給 only 就只抓指定的那幾則）：系列文建立之前就有的留言、或即時通知漏掉的。
 * 跑一樣的規則，但**不自動送出**：命中的會是「待送出」，由會員自己決定要不要回（否則把一篇有上百則留言的貼文
 * 加進系列文，會一口氣對所有人回覆加私訊）。每次最多看 4 則貼文、收 12 則新留言，其餘下次同步再收。
 */
export async function importSeriesComments(platform: 'instagram' | 'facebook', connection: Connection, token: string, ownerId: number, only?: string[]) {
  const db = useDb()
  try {
    const [found, seenRows] = await db.batch([
      db.select({ externalId: accountPosts.externalId }).from(accountPosts)
        .innerJoin(collectionPosts, eq(collectionPosts.postId, accountPosts.id))
        .where(eq(accountPosts.accountId, connection.accountId)).orderBy(sql`${accountPosts.publishedAt} desc`).limit(4),
      db.select({ externalId: comments.externalId }).from(comments)
        .where(and(eq(comments.accountId, connection.accountId), isNotNull(comments.externalId))).orderBy(sql`${comments.id} desc`).limit(1000),
    ])
    // only：只補抓指定的貼文（貼文管理頁點開一則貼文時），不限系列文
    const targets = only ? only.map(externalId => ({ externalId })) : found
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
    if (isLinkedPlatform(platform)) await syncAccountPosts(platform, connection, 6, ownerId)
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
const THREADS_PER_POLL = 6
/**
 * 這一輪要檢查哪幾則 Threads 貼文（posts 由新到舊）：最新的 2 則每輪都看，剩下 4 個名額由「系列文裡的」與「其他的」各分一半，
 * 各自依輪次（每 5 分鐘加一）輪流；其中一邊不夠就把名額讓給另一邊。系列文裡的會自動回覆，所以輪到的機會比較多。
 */
export function pickForPoll<T extends { inSeries: unknown }>(posts: T[], round: number, perPoll = THREADS_PER_POLL): T[] {
  if (posts.length <= perPoll) return posts
  const always = posts.slice(0, 2)
  const rest = posts.slice(2)
  const series = rest.filter(p => p.inSeries != null)
  const others = rest.filter(p => p.inSeries == null)
  const slots = perPoll - always.length
  const forSeries = Math.min(series.length, Math.max(slots / 2, slots - others.length))
  const rotate = (list: T[], n: number) => Array.from({ length: Math.min(n, list.length) }, (_, i) => list[(round * n + i) % list.length]!)
  return [...always, ...rotate(series, forSeries), ...rotate(others, slots - forSeries)]
}

export async function pollThreads(maxConnections = 3) {
  const db = useDb()
  // Threads 與 YouTube 都沒有留言的即時通知，一起在這裡輪詢
  const due = await db.select({ connection: connections, ownerId: accounts.ownerId, platform: accounts.platform }).from(connections)
    .innerJoin(accounts, eq(accounts.id, connections.accountId))
    .where(inArray(accounts.platform, ['threads', 'youtube']))
    .orderBy(sql`${connections.lastPolledAt} is not null`, asc(connections.lastPolledAt))
    .limit(maxConnections)
  for (const { connection, ownerId, platform } of due) {
    await db.update(connections).set({ lastPolledAt: nowIso() }).where(eq(connections.id, connection.id))
    try {
      // 已同步的貼文都會輪到（貼文管理頁要看得到每則的回覆），每輪最多 THREADS_PER_POLL 則（每則 1 個請求）
      const known = await db.select({ id: accountPosts.externalId, text: accountPosts.text, inSeries: collectionPosts.collectionId }).from(accountPosts)
        .leftJoin(collectionPosts, eq(collectionPosts.postId, accountPosts.id))
        .where(eq(accountPosts.accountId, connection.accountId)).orderBy(desc(accountPosts.publishedAt)).limit(200)
      // YouTube 每天的額度是整個站共用的，一輪少看幾支（4 支 × 每天 288 輪 ≈ 1,150 單位）
      const source = platform === 'youtube' ? 'youtube' : 'threads'
      const threads = pickForPoll(known, Math.floor(Date.now() / 300_000), source === 'youtube' ? 4 : THREADS_PER_POLL)
      if (!threads.length) continue
      const warning = await importThreadConversations(connection, ownerId, threads, 6, source)
      if (warning || connection.lastError) await db.update(connections).set({ lastError: warning }).where(eq(connections.id, connection.id))
    }
    catch (e) {
      await db.update(connections).set({ lastError: `讀取留言失敗：${(e as Error).message}`.slice(0, 300) }).where(eq(connections.id, connection.id))
    }
  }
}

/**
 * 把幾則 Threads 貼文底下的整串對話收進來：別人的留言照規則處理（新的會自動回，舊的與對話裡的後續回覆只記錄），
 * 帳號自己的回覆與子文記成 own。排程輪詢與貼文管理頁「點開一則貼文」共用。
 * limit 是這次最多處理幾則別人的留言（回一則要 2 個請求、幾個 D1 查詢）。整串讀不到、只拿到第一層時回傳原因。
 */
export async function importThreadConversations(connection: Connection, ownerId: number, threads: { id: string, text: string, inSeries: number | null }[], limit: number, source: 'threads' | 'youtube' = 'threads') {
  const db = useDb()
  const token = await unseal(connection.tokenEnc)
  // 已經收過的一次查出來，不要每則查一次（Free 方案每次 50 個 D1 查詢）
  const stored = await db.select({ externalId: comments.externalId, parentExternalId: comments.parentExternalId, mine: comments.mine }).from(comments)
    .where(and(eq(comments.accountId, connection.accountId), isNotNull(comments.externalId)))
    .orderBy(sql`${comments.id} desc`).limit(2000)
  const seen = new Set(stored.map(r => r.externalId))
  // 子文：帳號自己接在主文（或另一則子文）下面的貼文。回在子文底下的留言跟回在主文底下的一樣算「留言」
  const parts = new Set<string>()
  for (let grew = true; grew;) {
    grew = false
    for (const r of stored) {
      if (r.mine && r.externalId && !parts.has(r.externalId) && (r.parentExternalId === '' || parts.has(r.parentExternalId))) {
        parts.add(r.externalId)
        grew = true
      }
    }
  }
  let boot: OwnedBoot | undefined
  let handled = 0
  let warning = ''
  for (const thread of threads) {
    // conversation 一次拿到整串（含回覆的回覆與自己的回覆）；讀不到就退回只看第一層，並把原因帶出去
    // YouTube 的影片留言走同一套流程：一支影片當成一則貼文，留言與回覆攤平成一樣的形狀
    const nodes: (ThreadNode & { senderId?: string })[] = source === 'youtube' ? await youtubeComments(token, thread.id, connection.externalId) : await listThreadConversation(token, thread.id).catch(async (e) => {
      warning = `讀不到整串對話（只抓到第一層回覆）：${(e as Error).message}`.slice(0, 300)
      return (await listThreadReplies(token, thread.id)).map(r => ({ ...r, parentId: thread.id, mine: false })).reverse()
    })
    const own: (typeof comments.$inferInsert)[] = []
    for (const node of nodes) {
      const parent = node.parentId === thread.id ? '' : node.parentId
      if (!node.timestamp || !node.text.trim()) continue
      const at = new Date(node.timestamp).toISOString()
      if (node.mine || node.username === connection.externalName) {
        if (parent === '' || parts.has(parent)) parts.add(node.id)
        if (!seen.has(node.id)) {
          own.push({
            accountId: connection.accountId, collectionId: thread.inSeries, postTitle: thread.text, author: `@${connection.externalName}`, text: node.text,
            createdAt: at, status: 'own', mine: true, kind: 'comment', externalId: node.id, externalPostId: thread.id, parentExternalId: parent,
          })
        }
        continue
      }
      if (seen.has(node.id) || handled >= limit) continue
      handled++
      boot ??= await loadBoot(ownerId)
      const top = parent === '' || parts.has(parent)
      const incoming = { externalId: node.id, senderId: node.senderId || node.username, author: `@${node.username}`, text: node.text, externalPostId: thread.id }
      // 對話裡的後續回覆只記錄；連結之前就在的舊留言也只記錄、不自動送出（命中系列文設定的會是「待送出」），否則一連結就會對歷史留言洗一輪
      if (top && at > connection.createdAt) await receive(boot, source, connection, { ...incoming, parentExternalId: parent })
      else await processComment(boot, { accountId: connection.accountId, ...incoming, at, parentExternalId: parent, nested: !top }).catch((e) => { if (!/UNIQUE/i.test(String((e as Error)?.cause ?? e))) throw e })
    }
    // D1 一個 statement 最多 100 個參數，而多列 insert 每一列會把 20 個欄位全部帶上：一次最多 4 列，整批用 batch 一趟送出
    const writes = []
    for (let i = 0; i < own.length; i += 4) writes.push(db.insert(comments).values(own.slice(i, i + 4)).onConflictDoNothing())
    await batchWrites(writes)
  }
  return warning
}

/**
 * 系列文成效頁的「立即同步」：只同步這個系列文裡的貼文，不管貼文多舊（排程只顧最近的貼文，舊的由會員手動補）。
 * 每則貼文抓一次成效數字（1–3 個請求），Threads 的再抓整串對話，Instagram／Facebook 的補抓既有留言。
 * Free 方案一個請求最多 50 個對外請求，所以一次最多 8 則（最久沒更新的優先），貼文更多就再按一次。
 */
export async function syncSeries(uid: number, seriesId: number) {
  const db = useDb()
  const rows = await db.select({ post: accountPosts, platform: accounts.platform, connection: connections }).from(collectionPosts)
    .innerJoin(accountPosts, eq(accountPosts.id, collectionPosts.postId))
    .innerJoin(accounts, eq(accounts.id, accountPosts.accountId))
    .leftJoin(connections, eq(connections.accountId, accounts.id))
    .where(and(eq(collectionPosts.collectionId, seriesId), eq(accounts.ownerId, uid)))
    .orderBy(sql`${accountPosts.insightsAt} is not null`, asc(accountPosts.insightsAt))
  const usable = rows.filter(r => r.connection && isLinkedPlatform(r.platform))
  const batch = usable.slice(0, 8)
  const errors = new Set<string>()
  const now = nowIso()
  const writes = []
  const tokens = new Map<number, string>()
  const tokenOf = async (c: Connection) => tokens.get(c.id) ?? tokens.set(c.id, await unseal(c.tokenEnc)).get(c.id)!
  let synced = 0
  const refreshed: number[] = []
  for (const { post, platform, connection } of batch) {
    try {
      const m = await fetchMetrics(platform as LinkedPlatform, await tokenOf(connection!), post.externalId)
      // 觀看數讀不到時（貼文類型不支援、權限不足）只更新按讚與留言，不要把原本的觀看、分享、收藏蓋成 0
      const set = m.views > 0 ? m : { likes: m.likes, comments: m.comments }
      writes.push(db.update(accountPosts).set({ ...set, insightsAt: now }).where(eq(accountPosts.id, post.id)))
      refreshed.push(post.id)
      synced++
    }
    catch (e) {
      errors.add(`${connection!.externalName}：讀不到成效數字：${(e as Error).message}`)
    }
  }
  if (refreshed.length) writes.push(snapshotPostStats(inIdList(accountPosts.id, refreshed)))
  await batchWrites(writes)
  // 留言：同一個帳號的貼文一起處理
  const byConnection = new Map<number, typeof batch>()
  for (const r of batch) byConnection.set(r.connection!.id, [...(byConnection.get(r.connection!.id) ?? []), r])
  for (const group of byConnection.values()) {
    const { connection, platform } = group[0]!
    try {
      const warning = platform === 'threads' || platform === 'youtube'
        ? await importThreadConversations(connection!, uid, group.map(r => ({ id: r.post.externalId, text: r.post.text, inSeries: seriesId })), 4, platform)
        : await importSeriesComments(platform as 'instagram' | 'facebook', connection!, await tokenOf(connection!), uid)
      if (warning) errors.add(`${connection!.externalName}：${warning}`)
    }
    catch (e) {
      errors.add(`${connection!.externalName}：讀不到留言：${(e as Error).message}`)
    }
  }
  return { synced, total: usable.length, unlinked: rows.length - usable.length, errors: [...errors].map(e => e.slice(0, 300)) }
}
