import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { accountPosts, accounts, collectionPosts, collections, connections, publicPages, users } from '../database/schema'

type PageRow = typeof publicPages.$inferSelect
export type PageImageKind = 'avatar' | 'cover'
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
  return {
    name: text(body.name, 40),
    bio: text(body.bio, 300),
    theme: PAGE_THEMES.includes(body.theme as PageTheme) ? body.theme as PageTheme : 'night',
    accent: color(body.accent),
    bg: color(body.bg),
    blocks: types.map(type => ({ type, on: given.find(b => b?.type === type)?.on === true })),
    postIds: ids(body.postIds, PAGE_LIMITS.posts),
    seriesIds: ids(body.seriesIds, PAGE_LIMITS.series),
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
  const images = { avatar: row?.draftAvatarKey ? draftImageUrl('avatar', row.draftAvatarKey) : '', cover: row?.draftCoverKey ? draftImageUrl('cover', row.draftCoverKey) : '' }
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
const rateOf = (engagement: number, views: number) => (views ? `${(engagement / views * 100).toFixed(1)}%` : '—')

/**
 * 把設定變成對外輸出的內容。**只輸出打開的區塊**，而且每一項資料都用 owner 篩過：
 * 留言、留言者、名單、回覆設定、帳號的權杖都不在這裡，公開頁面永遠拿不到。
 */
export async function buildPageView(ownerId: number, config: PageConfig, images: { avatar: string, cover: string }): Promise<PageView> {
  const db = useDb()
  const on = new Set(config.blocks.filter(b => b.on).map(b => b.type))
  const since = new Date(Date.now() - 28 * 86400_000).toISOString()
  const engagement = sql<number>`${accountPosts.likes} + ${accountPosts.comments} + ${accountPosts.shares}`
  const [accountRows, statRows, postRows, seriesRows] = await db.batch([
    db.select({
      platform: accounts.platform, name: accounts.name, externalId: connections.externalId, externalName: connections.externalName,
      followers: sql<number | null>`(select s.followers from account_stats s where s.account_id = ${accounts.id} order by s.day desc limit 1)`,
    }).from(accounts).innerJoin(connections, eq(connections.accountId, accounts.id))
      .where(on.has('accounts') ? eq(accounts.ownerId, ownerId) : sql`0`).orderBy(accounts.id),
    db.select({
      views: sql<number>`coalesce(sum(${accountPosts.views}), 0)`, engagement: sql<number>`coalesce(sum(${engagement}), 0)`, posts: sql<number>`count(*)`,
    }).from(accountPosts).innerJoin(accounts, eq(accounts.id, accountPosts.accountId))
      .where(on.has('stats') ? and(eq(accounts.ownerId, ownerId), gte(accountPosts.publishedAt, since)) : sql`0`),
    db.select({
      id: accountPosts.id, platform: accounts.platform, text: accountPosts.text, url: accountPosts.url, views: accountPosts.views,
      engagement, publishedAt: accountPosts.publishedAt,
    }).from(accountPosts).innerJoin(accounts, eq(accounts.id, accountPosts.accountId))
      .where(on.has('posts') && config.postIds.length ? and(eq(accounts.ownerId, ownerId), inIdList(accountPosts.id, config.postIds)) : sql`0`),
    db.select({
      id: collections.id, name: collections.name, posts: sql<number>`count(${accountPosts.id})`, views: sql<number>`coalesce(sum(${accountPosts.views}), 0)`,
    }).from(collections).leftJoin(collectionPosts, eq(collectionPosts.collectionId, collections.id))
      .leftJoin(accountPosts, eq(accountPosts.id, collectionPosts.postId))
      .where(on.has('series') && config.seriesIds.length ? and(eq(collections.ownerId, ownerId), inIdList(collections.id, config.seriesIds)) : sql`0`)
      .groupBy(collections.id).orderBy(desc(collections.id)),
  ])
  const dayOf = (iso: string) => fmtDay(minutesToAt(Math.floor(Date.parse(iso) / 60000) + 480).slice(0, 10))
  return {
    name: config.name, bio: on.has('profile') ? config.bio : '',
    theme: config.theme, accent: config.accent, bg: config.bg,
    avatarUrl: on.has('profile') ? images.avatar : '', coverUrl: images.cover,
    blocks: config.blocks.filter(b => b.on).map(b => b.type),
    accounts: accountRows.filter(a => isPlatform(a.platform)).map(a => ({
      platform: a.platform as Platform, name: a.externalName || a.name, followers: a.followers, url: profileUrl(a.platform, a.externalId, a.externalName),
    })),
    stats: on.has('stats') ? { views: statRows[0]?.views ?? 0, rate: rateOf(statRows[0]?.engagement ?? 0, statRows[0]?.views ?? 0), posts: statRows[0]?.posts ?? 0 } : null,
    // 照會員排的順序
    posts: config.postIds.map(id => postRows.find(p => p.id === id)).filter(p => p && isPlatform(p.platform)).map(p => ({
      platform: p!.platform as Platform, text: p!.text, url: /^https?:\/\//i.test(p!.url) ? p!.url : '', views: p!.views, rate: rateOf(p!.engagement, p!.views), day: dayOf(p!.publishedAt),
    })),
    series: config.seriesIds.map(id => seriesRows.find(s => s.id === id)).filter(Boolean).map(s => ({ name: s!.name, posts: s!.posts, views: s!.views })),
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

export const livePageImages = (row: PageRow) => ({
  avatar: row.liveAvatarKey ? liveImageUrl(row.slug, 'avatar', row.liveAvatarKey) : '',
  cover: row.liveCoverKey ? liveImageUrl(row.slug, 'cover', row.liveCoverKey) : '',
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
export async function dropUnusedPageImages(candidates: string[], row: Pick<PageRow, 'draftAvatarKey' | 'draftCoverKey' | 'liveAvatarKey' | 'liveCoverKey'> | undefined) {
  const used = new Set(row ? [row.draftAvatarKey, row.draftCoverKey, row.liveAvatarKey, row.liveCoverKey] : [])
  const gone = [...new Set(candidates)].filter(k => k && !used.has(k))
  if (gone.length) await useMedia().delete(gone)
}
