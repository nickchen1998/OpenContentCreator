import { eq } from 'drizzle-orm'
import { accountPosts } from '../../../database/schema'

// 立刻向平台抓這一則貼文的最新資料，不用等排程：
// - 點開貼文時：只抓底下的留言（Threads 是整串對話；Instagram／Facebook 是第一層留言，回覆的回覆靠 webhook 即時進來）
// - 按這則貼文的「立即同步」（body.metrics）：再加上成效數字，舊貼文排程輪不到時用這個補
// 補抓到的留言只記錄、不自動送出（Threads 連結之後的新留言例外，跟排程輪詢一樣照系列文設定回）。
// warning 是沒抓到的原因，頁面會顯示出來
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const post = await ownedFeedPost(uid, idParam(event))
  const wantMetrics = (await bodyOf(event).catch(() => ({} as Record<string, unknown>))).metrics === true
  const found = await ownedConnection(uid, post.accountId)
  if (!found) return { rows: await loadPostReplies(post), warning: wantMetrics ? '這個帳號還沒有連結' : '', metrics: null }
  const warnings: string[] = []
  let metrics: { views: number, likes: number, comments: number, shares: number, saves: number } | null = null
  let token = ''
  try {
    token = await unseal(found.connection.tokenEnc)
    if (wantMetrics) {
      const m = await fetchMetrics(post.platform, token, post.externalId)
      // 觀看數讀不到時（貼文類型不支援、權限不足）只更新按讚與留言，不要把原本的觀看、分享、收藏蓋成 0
      const set = m.views > 0 ? m : { likes: m.likes, comments: m.comments }
      const [row] = await useDb().update(accountPosts).set({ ...set, insightsAt: nowIso() }).where(eq(accountPosts.id, post.id)).returning()
      if (row) metrics = { views: row.views, likes: row.likes, comments: row.comments, shares: row.shares, saves: row.saves }
    }
  }
  catch (e) {
    warnings.push(`讀不到成效數字：${(e as Error).message}`)
  }
  try {
    const warning = post.platform === 'threads' || post.platform === 'youtube'
      ? await importThreadConversations(found.connection, uid, [{ id: post.externalId, text: post.text, inSeries: post.seriesId }], 8, post.platform)
      : token ? await importSeriesComments(post.platform, found.connection, token, uid, [post.externalId]) : ''
    if (warning) warnings.push(warning)
  }
  catch (e) {
    warnings.push(`讀不到留言：${(e as Error).message}`)
  }
  return { rows: await loadPostReplies(post), warning: warnings.join('；').slice(0, 400), metrics }
})
