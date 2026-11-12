import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { accountPosts, accounts, collectionPosts, collections, connections, publicPages, users } from '../database/schema'

const COVER_KEY_RE = /^pages\/\d+\/series-\d+-[\w-]+$/

type PageRow = typeof publicPages.$inferSelect
export type PageImageKind = 'avatar' | 'cover'
export const SERIES_COVER_MAX = 5 * 1024 * 1024
export const PAGE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const PAGE_IMAGE_MAX: Record<PageImageKind, number> = { avatar: 2 * 1024 * 1024, cover: 5 * 1024 * 1024 }
export const isPageImageKind = (v: unknown): v is PageImageKind => v === 'avatar' || v === 'cover'

const parse = (json: string | null): PageConfig | null => {
  if (!json) return null
  try {
    return normalizePageConfig(JSON.parse(json))
  }
  catch {
    return null
  }
}

/**
 * 把外面送進來的設定整理成乾淨的 PageConfig：長度、顏色格式、連結只收 http／https／mailto。
 * 這裡不查貼文與系列文是不是這個會員的 —— 輸出時（buildPageView）一律用 owner 篩，別人的 id 放進來也不會有東西。
 */
export function normalizePageConfig(input: unknown): PageConfig {
  const body = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const color = (v: unknown) => (typeof v === 'string' && COLOR_RE.test(v) ? v.toLowerCase() : '')
  const ids = (v: unknown, max: number) => (Array.isArray(v) ? [...new Set(v.map(Number))].filter(n => Number.isInteger(n) && n > 0).slice(0, max) : [])
  const given = Array.isArray(body.blocks) ? body.blocks as { type?: unknown, on?: unknown }[] : []
  const order = given.map(b => b?.type).filter((t): t is PageBlock => PAGE_BLOCKS.includes(t as PageBlock))
  // 每種區塊剛好一個：少的補在後面（預設關閉），重複的只留第一個
  const types = [...new Set([...order, ...PAGE_BLOCKS])]
  const links = (Array.isArray(body.links) ? body.links as { label?: unknown, url?: unknown }[] : [])
    .map(l => ({ label: text(l?.label, 30), url: text(l?.url, 300) }))
    .filter(l => l.label && /^(https?:\/\/|mailto:)/i.test(l.url))
    .slice(0, PAGE_LIMITS.links)
  const list = (v: unknown, max: number, length: number) => (Array.isArray(v) ? [...new Set(v.map(x => text(x, length)).filter(Boolean))].slice(0, max) : [])
  // key 是系列文 id 的對照表
  const byId = (v: unknown, clean: (value: unknown) => string) => Object.fromEntries(
    Object.entries(v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {})
      .filter(([id]) => /^[1-9]\d{0,9}$/.test(id)).map(([id, value]) => [id, clean(value)] as const).filter(([, value]) => value).slice(0, 50),
  )
  // 這幾個是後來才加的設定：舊的草稿／已發布版本裡沒有，沒有時維持原本的樣子（不嵌入、原本那三個數字），頁面才不會在部署後自己變
  const legacy = !Array.isArray(body.statsShow)
  const email = text(body.contactEmail, 120)
  return {
    name: text(body.name, 40),
    tagline: text(body.tagline, 30),
    bio: text(body.bio, 300),
    theme: PAGE_THEMES.includes(body.theme as PageTheme) ? body.theme as PageTheme : 'night',
    accent: color(body.accent),
    bg: color(body.bg),
    blocks: types.map(type => ({ type, on: given.find(b => b?.type === type)?.on === true })),
    postIds: ids(body.postIds, PAGE_LIMITS.posts),
    seriesIds: ids(body.seriesIds, PAGE_LIMITS.series),
    statsDays: PAGE_STAT_DAYS.includes(body.statsDays as 28) ? body.statsDays as number : 28,
    statsShow: legacy ? ['views', 'rate', 'posts'] : PAGE_STATS.filter(k => (body.statsShow as unknown[]).includes(k)),
    accountsShow: Array.isArray(body.accountsShow) ? PAGE_ACCOUNT_STATS.filter(k => (body.accountsShow as unknown[]).includes(k)) : [...PAGE_ACCOUNT_STATS],
    accountsHidden: ids(body.accountsHidden, 50),
    postsEmbed: body.postsEmbed === true,
    collabItems: list(body.collabItems, PAGE_LIMITS.collabItems, 20),
    collabBrands: list(body.collabBrands, PAGE_LIMITS.collabBrands, 30),
    contactEmail: isContactEmail(email) ? email : '',
    contactLabel: text(body.contactLabel, 20),
    seriesLayout: body.seriesLayout === 'v' ? 'v' : 'h',
    seriesTop: body.seriesTop === true,
    seriesText: byId(body.seriesText, v => text(v, 80)),
    seriesCovers: byId(body.seriesCovers, v => (typeof v === 'string' && COVER_KEY_RE.test(v) ? v : '')),
    textTitle: text(body.textTitle, 40),
    textBody: text(body.textBody, 1000),
    links,
    shareTitle: text(body.shareTitle, 60),
    shareText: text(body.shareText, 160),
  }
}

/** 這個會員的公開頁面（還沒建立過就是 undefined） */
export async function loadPageRow(uid: number) {
  const [row] = await useDb().select().from(publicPages).where(eq(publicPages.ownerId, uid))
  return row
}

/** 編輯畫面要的狀態：代號、是否已發布、草稿、有沒有還沒發布的修改，以及草稿的預覽 */
export async function pageState(uid: number) {
  const row = await loadPageRow(uid)
  let draft = parse(row?.draft ?? null)
  let slug = row?.slug ?? ''
  if (!draft) {
    const [user] = await useDb().select({ username: users.username }).from(users).where(eq(users.id, uid))
    draft = defaultPageConfig(user?.username ?? '')
    // 預設的代號用帳號名稱（不合格式的字元換成 -）；真的存檔時才檢查有沒有被用掉
    slug = (user?.username ?? '').replace(/[^a-z0-9-]/g, '-').replace(/^-+/, '').slice(0, 32)
  }
  const images = {
    avatar: row?.draftAvatarKey ? draftImageUrl('avatar', row.draftAvatarKey) : '', cover: row?.draftCoverKey ? draftImageUrl('cover', row.draftCoverKey) : '',
    series: seriesCoverUrls(draft, (id, key) => `/api/page/image?kind=series&id=${id}&v=${version(key)}`),
  }
  const dirty = Boolean(row?.published) && (row!.draft !== row!.live || row!.draftAvatarKey !== row!.liveAvatarKey || row!.draftCoverKey !== row!.liveCoverKey)
  return { slug, published: Boolean(row?.published), dirty, draft, images, view: await buildPageView(uid, draft, images) }
}

// 網址後面帶 key 的尾巴當版本：換圖之後網址會變，瀏覽器不會拿到舊的快取
const version = (key: string) => key.slice(-8)
const draftImageUrl = (kind: PageImageKind, key: string) => `/api/page/image?kind=${kind}&v=${version(key)}`
export const liveImageUrl = (slug: string, kind: PageImageKind, key: string) => `/api/public/${slug}/${kind}?v=${version(key)}`

const profileUrl = (platform: string, externalId: string, externalName: string) => {
  if (platform === 'instagram') return `https://www.instagram.com/${encodeURIComponent(externalName)}/`
  if (platform === 'threads') return `https://www.threads.net/@${encodeURIComponent(externalName)}`
  if (platform === 'youtube') return `https://www.youtube.com/channel/${encodeURIComponent(externalId)}`
  return `https://www.facebook.com/${encodeURIComponent(externalId)}`
}
type PageImages = { avatar: string, cover: string, series: Record<string, string> }
/** 各系列文封面的網址。key 一定要在這個設定裡（上傳的端點寫進來的），網址怎麼組由呼叫的人決定（草稿與對外不同） */
const seriesCoverUrls = (config: PageConfig, urlOf: (id: string, key: string) => string) =>
  Object.fromEntries(Object.entries(config.seriesCovers).map(([id, key]) => [id, urlOf(id, key)]))
/** 草稿或已發布版本（JSON）裡用到的系列文封面 */
export const seriesCoverKeys = (json: string | null | undefined) => Object.values(parse(json ?? null)?.seriesCovers ?? {})
export const parsePageConfig = (json: string | null | undefined) => parse(json ?? null)
const rateOf = (engagement: number, views: number) => (views ? `${(engagement / views * 100).toFixed(1)}%` : '—')

/**
 * 把設定變成對外輸出的內容。**只輸出打開的區塊**，而且每一項資料都用 owner 篩過：
 * 留言、留言者、名單、回覆設定、帳號的權杖都不在這裡，公開頁面永遠拿不到。
 */
export async function buildPageView(ownerId: number, config: PageConfig, images: PageImages): Promise<PageView> {
  const db = useDb()
  const on = new Set(config.blocks.filter(b => b.on).map(b => b.type))
  const today = todayTaipei()
  const since = new Date(Date.now() - config.statsDays * 86400_000).toISOString()
  const startDay = addDays(today, -config.statsDays)
  const engagement = sql<number>`${accountPosts.likes} + ${accountPosts.comments} + ${accountPosts.shares}`
  const numbers = on.has('accounts') || on.has('stats')
  const postsOn = on.has('posts')
  const seriesOn = on.has('series') && config.seriesIds.length > 0
  const postColumns = {
    id: accountPosts.id, platform: accounts.platform, text: accountPosts.text, url: accountPosts.url, externalId: accountPosts.externalId,
    views: accountPosts.views, engagement, publishedAt: accountPosts.publishedAt,
  }
  const [accountRows, statRows, postRows, seriesRows, topRows] = await db.batch([
    db.select({
      id: accounts.id, platform: accounts.platform, name: accounts.name, externalId: connections.externalId, externalName: connections.externalName,
      followers: sql<number | null>`(select s.followers from account_stats s where s.account_id = ${accounts.id} order by s.day desc limit 1)`,
      // 期間開始那天或更早的最後一筆；沒有就算不出增減（不估算）
      base: sql<number | null>`(select s.followers from account_stats s where s.account_id = ${accounts.id} and s.day <= ${startDay} order by s.day desc limit 1)`,
    }).from(accounts).innerJoin(connections, eq(connections.accountId, accounts.id))
      .where(numbers ? eq(accounts.ownerId, ownerId) : sql`0`).orderBy(accounts.id),
    db.select({
      accountId: accountPosts.accountId,
      views: sql<number>`coalesce(sum(${accountPosts.views}), 0)`, engagement: sql<number>`coalesce(sum(${engagement}), 0)`, posts: sql<number>`count(*)`,
    }).from(accountPosts).innerJoin(accounts, eq(accounts.id, accountPosts.accountId))
      .where(numbers ? and(eq(accounts.ownerId, ownerId), gte(accountPosts.publishedAt, since)) : sql`0`).groupBy(accountPosts.accountId),
    db.select(postColumns).from(accountPosts).innerJoin(accounts, eq(accounts.id, accountPosts.accountId))
      .where(postsOn && config.postIds.length ? and(eq(accounts.ownerId, ownerId), inIdList(accountPosts.id, config.postIds)) : sql`0`),
    db.select({
      id: collections.id, name: collections.name, posts: sql<number>`count(${accountPosts.id})`, views: sql<number>`coalesce(sum(${accountPosts.views}), 0)`,
    }).from(collections).leftJoin(collectionPosts, eq(collectionPosts.collectionId, collections.id))
      .leftJoin(accountPosts, eq(accountPosts.id, collectionPosts.postId))
      .where(seriesOn ? and(eq(collections.ownerId, ownerId), inIdList(collections.id, config.seriesIds)) : sql`0`)
      .groupBy(collections.id).orderBy(desc(collections.id)),
    // 每個系列文觀看最高的幾則：同一個系列文裡排在它前面的不到 N 則才留下
    db.select({
      seriesId: collectionPosts.collectionId, platform: accounts.platform, text: accountPosts.text, url: accountPosts.url,
      views: accountPosts.views, publishedAt: accountPosts.publishedAt,
    }).from(collectionPosts).innerJoin(collections, eq(collections.id, collectionPosts.collectionId))
      .innerJoin(accountPosts, eq(accountPosts.id, collectionPosts.postId)).innerJoin(accounts, eq(accounts.id, accountPosts.accountId))
      .where(seriesOn && config.seriesTop
        ? and(eq(collections.ownerId, ownerId), eq(accounts.ownerId, ownerId), inIdList(collections.id, config.seriesIds),
            sql`(select count(*) from collection_posts cp2 join account_posts ap2 on ap2.id = cp2.post_id
              where cp2.collection_id = ${collectionPosts.collectionId}
                and (ap2.views > ${accountPosts.views} or (ap2.views = ${accountPosts.views} and ap2.id > ${accountPosts.id}))) < ${PAGE_LIMITS.seriesTop}`)
        : sql`0`)
      .orderBy(desc(accountPosts.views), desc(accountPosts.id)),
  ])
  const dayOf = (iso: string) => fmtDay(minutesToAt(Math.floor(Date.parse(iso) / 60000) + 480).slice(0, 10))
  const safeUrl = (url: string) => (/^https?:\/\//i.test(url) ? url : '')

  // ---- 數字：各平台一列，加總起來就是最上面那幾格 ----
  const perAccount = accountRows.filter(a => isPlatform(a.platform)).map((a) => {
    const stat = statRows.find(r => r.accountId === a.id)
    return {
      id: a.id, platform: a.platform as Platform, name: a.externalName || a.name, followers: a.followers, url: profileUrl(a.platform, a.externalId, a.externalName),
      views: stat?.views ?? 0, engagement: stat?.engagement ?? 0, posts: stat?.posts ?? 0,
      growth: a.followers != null && a.base != null ? a.followers - a.base : null,
    }
  })
  const sum = (pick: (a: typeof perAccount[number]) => number | null) => {
    const values = perAccount.map(pick).filter((v): v is number => v != null)
    return values.length ? values.reduce((x, y) => x + y, 0) : null
  }
  const total = { views: sum(a => a.views) ?? 0, engagement: sum(a => a.engagement) ?? 0, posts: sum(a => a.posts) ?? 0 }
  const statValue: Record<PageStat, { n: number | null, text: string, signed?: boolean }> = {
    followers: { n: sum(a => a.followers), text: '—' },
    avgViews: { n: total.posts ? Math.round(total.views / total.posts) : null, text: '—' },
    rate: { n: null, text: rateOf(total.engagement, total.views) },
    growth: { n: sum(a => a.growth), text: '—', signed: true },
    views: { n: total.views, text: '' },
    posts: { n: total.posts, text: '' },
  }

  // ---- 精選貼文：只顯示會員自己挑的（不自動補，使用者要求）；啟用嵌入時能嵌入的都用平台的嵌入框 ----
  const pinned = config.postIds.map(id => postRows.find(p => p.id === id)).filter((p): p is typeof postRows[number] => Boolean(p))
  const picked = pinned.filter(p => isPlatform(p.platform)).slice(0, PAGE_LIMITS.posts)
  const posts = !postsOn ? [] : picked.map((p) => {
    const platform = p.platform as Platform
    const embed = config.postsEmbed ? embedOf(platform, p.url, p.externalId) : null
    return { platform, text: p.text, url: safeUrl(p.url), views: p.views, rate: rateOf(p.engagement, p.views), day: dayOf(p.publishedAt), embed }
  })

  const showAccount = new Set(config.accountsShow)
  const email = on.has('collab') ? config.contactEmail : ''
  return {
    name: config.name, tagline: on.has('profile') ? config.tagline : '', bio: on.has('profile') ? config.bio : '',
    theme: config.theme, accent: config.accent, bg: config.bg,
    avatarUrl: on.has('profile') ? images.avatar : '', coverUrl: images.cover,
    blocks: config.blocks.filter(b => b.on).map(b => b.type),
    // 會員沒選的數字不帶出去；不想列出來的帳號整列拿掉（最上面的總數仍然是全部帳號加總）
    accounts: !on.has('accounts') ? [] : perAccount.filter(a => !config.accountsHidden.includes(a.id)).map(a => ({
      platform: a.platform, name: a.name, url: a.url,
      followers: showAccount.has('followers') ? a.followers : null,
      avgViews: showAccount.has('avgViews') && a.posts ? Math.round(a.views / a.posts) : null,
      rate: showAccount.has('rate') ? rateOf(a.engagement, a.views) : '',
      growth: showAccount.has('growth') ? a.growth : null,
    })),
    accountsShow: on.has('accounts') ? config.accountsShow : [],
    stats: on.has('stats')
      ? { days: config.statsDays, items: config.statsShow.map(key => ({ key, label: PAGE_STAT_LABELS[key], n: statValue[key].n, text: statValue[key].text, signed: statValue[key].signed === true })) }
      : null,
    collab: on.has('collab') ? { items: config.collabItems, brands: config.collabBrands } : null,
    contact: email ? { label: config.contactLabel || '合作洽詢', email } : null,
    posts,
    // 照會員排的順序
    series: !seriesOn ? [] : config.seriesIds.map(id => seriesRows.find(s => s.id === id)).filter((s): s is typeof seriesRows[number] => Boolean(s)).map(s => ({
      name: s.name, text: config.seriesText[s.id] ?? '', coverUrl: images.series[s.id] ?? '', posts: s.posts, views: s.views,
      top: topRows.filter(t => t.seriesId === s.id && isPlatform(t.platform)).slice(0, PAGE_LIMITS.seriesTop)
        .map(t => ({ platform: t.platform as Platform, text: t.text, url: safeUrl(t.url), views: t.views, day: dayOf(t.publishedAt) })),
    })),
    seriesLayout: config.seriesLayout,
    textTitle: on.has('text') ? config.textTitle : '', textBody: on.has('text') ? config.textBody : '',
    links: on.has('links') ? config.links : [],
    share: {
      title: config.shareTitle || config.name || 'OpenContentCreator',
      // 沒另外寫說明時用介紹，但介紹所在的區塊被關掉的話就不拿來用
      // 預覽卡片只有一兩行，介紹裡的換行換成空白
      text: (config.shareText || (on.has('profile') ? config.bio : '')).replace(/\s+/g, ' ').trim().slice(0, 160),
      image: images.cover || (on.has('profile') ? images.avatar : ''),
    },
  }
}

/** 對外：依代號找已發布的頁面 */
export async function loadPublishedPage(slug: string) {
  if (!SLUG_RE.test(slug)) return
  const [row] = await useDb().select().from(publicPages).where(and(eq(publicPages.slug, slug), eq(publicPages.published, true)))
  const config = parse(row?.live ?? null)
  return row && config ? { row, config } : undefined
}

export const livePageImages = (row: PageRow, config: PageConfig): PageImages => ({
  avatar: row.liveAvatarKey ? liveImageUrl(row.slug, 'avatar', row.liveAvatarKey) : '',
  cover: row.liveCoverKey ? liveImageUrl(row.slug, 'cover', row.liveCoverKey) : '',
  series: seriesCoverUrls(config, (id, key) => `/api/public/${row.slug}/series?id=${id}&v=${version(key)}`),
})

/** 把 R2 裡的圖片回給瀏覽器。只會是上傳時檢查過的圖片類型；一律 nosniff */
export async function servePageImage(key: string, cache: string) {
  const object = key ? await useMedia().get(key) : null
  if (!object) throw notFound('圖片')
  const type = String((object as { httpMetadata?: { contentType?: string } }).httpMetadata?.contentType ?? '')
  return new Response(object.body, {
    headers: {
      'Content-Type': PAGE_IMAGE_TYPES.includes(type) ? type : 'application/octet-stream',
      'Content-Length': String(object.size),
      'Cache-Control': cache,
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

/** 刪掉不再被草稿或已發布版本用到的圖片 */
export async function dropUnusedPageImages(candidates: string[], row: PageRow | undefined) {
  const used = new Set(row ? [row.draftAvatarKey, row.draftCoverKey, row.liveAvatarKey, row.liveCoverKey, ...seriesCoverKeys(row.draft), ...seriesCoverKeys(row.live)] : [])
  const gone = [...new Set(candidates)].filter(k => k && !used.has(k))
  if (gone.length) await useMedia().delete(gone)
}

/** 上傳／移除系列文封面時用：query 的 id 要是這個會員自己的系列文，否則當作不存在 */
export async function ownedSeriesId(uid: number, value: unknown) {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) throw notFound('系列文')
  const [row] = await useDb().select({ id: collections.id }).from(collections).where(and(eq(collections.id, id), eq(collections.ownerId, uid)))
  if (!row) throw notFound('系列文')
  return id
}
/** 把草稿裡某個系列文的封面換成 key（空字串＝移除），回傳被換掉的舊 key */
export async function setDraftSeriesCover(row: PageRow, seriesId: number, key: string) {
  const config = parse(row.draft) ?? defaultPageConfig()
  const previous = config.seriesCovers[seriesId] ?? ''
  if (key) config.seriesCovers[seriesId] = key
  else delete config.seriesCovers[seriesId]
  await useDb().update(publicPages).set({ draft: JSON.stringify(config), updatedAt: nowIso() }).where(eq(publicPages.ownerId, row.ownerId))
  return previous
}
/** 這把 key 是不是這個會員上傳的（key 的開頭帶著會員 id） */
export const ownsPageImage = (ownerId: number, key: string) => key.startsWith(`pages/${ownerId}/`)

/**
 * 發布時把精選貼文的成效向平台重抓一次（舊貼文排程輪不到，掛在公開頁面上的數字會是舊的，甚至是 0）。
 * 最多 6 則、各打一次平台，全部放在這一個請求裡；抓不到的那幾則維持原本的數字，回傳沒抓到的則數，不讓發布失敗。
 */
export async function refreshFeaturedMetrics(uid: number, config: PageConfig) {
  const ids = config.blocks.some(b => b.type === 'posts' && b.on) ? config.postIds.slice(0, PAGE_LIMITS.posts) : []
  if (!ids.length) return 0
  const db = useDb()
  const rows = await db.select({
    id: accountPosts.id, externalId: accountPosts.externalId, platform: accounts.platform, tokenEnc: connections.tokenEnc,
  }).from(accountPosts).innerJoin(accounts, eq(accounts.id, accountPosts.accountId)).innerJoin(connections, eq(connections.accountId, accounts.id))
    .where(and(eq(accounts.ownerId, uid), inIdList(accountPosts.id, ids)))
  const now = nowIso()
  const results = await Promise.allSettled(rows.map(async (row) => {
    if (!isLinkedPlatform(row.platform)) throw new Error('不支援的平台')
    const m = await fetchMetrics(row.platform, await unseal(row.tokenEnc), row.externalId)
    // 跟單則同步一樣：觀看數讀不到時只更新按讚與留言，不把原本的觀看、分享、收藏蓋成 0
    // 包一層再回傳：查詢建構器本身是 thenable，直接從 async 函式回傳會被當場執行，就放不進後面的 batch 了
    return { write: db.update(accountPosts).set({ ...(m.views > 0 ? m : { likes: m.likes, comments: m.comments }), insightsAt: now }).where(eq(accountPosts.id, row.id)) }
  }))
  const updates = results.flatMap(r => (r.status === 'fulfilled' ? [r.value.write] : []))
  const done = rows.filter((_, i) => results[i]!.status === 'fulfilled').map(r => r.id)
  // 今天的數字順便記一筆（post_stats），排在更新之後
  if (updates.length) await batchWrites([...updates, snapshotPostStats(inIdList(accountPosts.id, done))])
  return ids.length - done.length
}
