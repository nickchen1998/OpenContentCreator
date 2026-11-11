import { eq } from 'drizzle-orm'
import { accountPosts } from '../../../database/schema'

// 立刻向 Threads 抓這一則貼文的最新資料，不用等排程：
// - 點開貼文時：只抓底下的整串對話
// - 按這則貼文的「立即同步」（body.metrics）：再加上成效數字（觀看、按讚、回覆、轉發），舊貼文排程輪不到時用這個補
// warning 是沒抓到的原因（整串讀不到只拿到第一層、成效讀不到），頁面會顯示出來
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const thread = await ownedThread(uid, idParam(event))
  const wantMetrics = (await bodyOf(event).catch(() => ({} as Record<string, unknown>))).metrics === true
  const found = await ownedConnection(uid, thread.accountId)
  if (!found) return { rows: await loadThreadReplies(thread), warning: wantMetrics ? '這個帳號還沒有連結' : '', metrics: null }
  const warnings: string[] = []
  let metrics: { views: number, likes: number, comments: number, shares: number } | null = null
  if (wantMetrics) {
    try {
      const m = await fetchInsights('threads', await unseal(found.connection.tokenEnc), thread.externalId)
      metrics = { views: m.views ?? 0, likes: m.likes ?? 0, comments: m.comments ?? 0, shares: m.shares ?? 0 }
      await useDb().update(accountPosts).set({ ...metrics, insightsAt: nowIso() }).where(eq(accountPosts.id, thread.id))
    }
    catch (e) {
      warnings.push(`讀不到成效數字：${(e as Error).message}`)
    }
  }
  try {
    const warning = await importThreadConversations(found.connection, uid, [{ id: thread.externalId, text: thread.text, inSeries: thread.seriesId }], 8)
    if (warning) warnings.push(warning)
  }
  catch (e) {
    warnings.push(`讀取 Threads 回覆失敗：${(e as Error).message}`)
  }
  return { rows: await loadThreadReplies(thread), warning: warnings.join('；').slice(0, 400), metrics }
})
