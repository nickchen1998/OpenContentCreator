<script setup lang="ts">
// 系列文的成效：合計、系列裡每則貼文、留言紀錄
const id = Number(useRoute().params.id)
const { accountLabel } = useLookup()
const series = ref<Series>()
const comments = ref<CommentRow[]>([])
const missing = ref(false)
const filter = ref<'all' | 'failed' | 'open'>('all')
const busyId = ref(0)
const settingsOpen = ref(false)
const backToList = () => navigateTo('/series')

async function load() {
  try {
    const data = await api<{ series: Series, comments: CommentRow[] }>(`/api/series/${id}`)
    series.value = data.series
    comments.value = data.comments
  }
  catch {
    missing.value = true
  }
}
onMounted(load)

const totals = computed(() => totalsOf(series.value?.posts ?? []))
const rate = (eng: number, views: number) => (views ? `${(eng / views * 100).toFixed(1)}%` : '—')
const dayOf = (iso: string) => fmtDay(minutesToAt(Math.floor(Date.parse(iso) / 60000) + 480).slice(0, 10))
const timeOf = (iso: string) => minutesToAt(Math.floor(Date.parse(iso) / 60000) + 480).replace('T', ' ').slice(5)
// 每則貼文收到幾則留言、送出幾則私訊（留言紀錄裡同一個帳號、同一段貼文文字的）
const failed = (c: CommentRow) => c.status === 'ready' && Boolean(c.error)
const dmFailed = (c: CommentRow) => c.status === 'sent' && Boolean(c.error)
const stateOf = (c: CommentRow) => {
  if (failed(c)) return { label: '送出失敗', style: 'background: var(--danger-bg); color: var(--danger)' }
  if (dmFailed(c)) return { label: '已回覆，私訊失敗', style: 'background: var(--warn-bg); color: var(--warn)' }
  if (c.status === 'sent') return { label: c.dmText ? '已回覆＋私訊' : '已回覆', style: 'background: var(--green-soft); color: var(--green-deep)' }
  if (c.status === 'ready') return { label: '待送出', style: 'background: var(--warn-bg); color: var(--warn)' }
  if (c.status === 'handled') return { label: '已處理', style: 'background: var(--chip-bg); color: var(--muted)' }
  return { label: c.status === 'unmatched' ? '沒有關鍵字' : '已回過，不重複', style: 'background: var(--chip-bg); color: var(--muted)' }
}
const filtered = computed(() => comments.value.filter(c =>
  filter.value === 'all' || (filter.value === 'failed' ? failed(c) || dmFailed(c) : c.status === 'unmatched' || c.status === 'skipped' || c.status === 'ready')))
// 留言紀錄：在區塊內捲動，每頁 10 則
const PAGE_SIZE = 10
const page = ref(1)
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const shown = computed(() => filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
const logEl = ref<HTMLElement>()
function goPage(n: number) {
  page.value = Math.min(Math.max(1, n), pages.value)
  logEl.value?.scrollTo({ top: 0 })
}
watch([filter, () => comments.value.length], () => goPage(Math.min(page.value, pages.value)))
watch(filter, () => goPage(1))

// 成效統計的圖表資料
const SERIES_GREEN = '#3e5346'
// 互動組成的四個顏色經過色盲辨識度檢查（dataviz 的 validate_palette），順序固定不要調換
const PARTS = [
  { key: 'likes', label: '按讚', color: '#1baf7a' },
  { key: 'comments', label: '留言', color: '#eb6834' },
  { key: 'shares', label: '分享', color: '#6250d6' },
  { key: 'saves', label: '收藏', color: '#eda100' },
] as const
const postLabels = computed(() => {
  const list = series.value?.posts ?? []
  const platforms = list.map(p => accountLabel(p.accountId).split(' · ')[0]!)
  // 同一個平台有兩則以上時補上日期才分得出來
  return list.map((p, i) => (platforms.filter(x => x === platforms[i]).length > 1 ? `${platforms[i]} ${dayOf(p.publishedAt)}` : platforms[i]!))
})
const viewsData = computed(() => [{ label: '觀看', data: (series.value?.posts ?? []).map(p => p.views), color: SERIES_GREEN }])
const partsData = computed(() => PARTS.map(part => ({ label: part.label, data: (series.value?.posts ?? []).map(p => p[part.key]), color: part.color })))
const rowsHeight = computed(() => Math.max(110, (series.value?.posts.length ?? 0) * 46 + 44))
const daily = computed(() => {
  const today = todayTaipei()
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13))
  const counts = new Map(days.map(d => [d, 0]))
  for (const c of comments.value) {
    const day = minutesToAt(Math.floor(Date.parse(c.createdAt) / 60000) + 480).slice(0, 10)
    if (counts.has(day)) counts.set(day, counts.get(day)! + 1)
  }
  return { labels: days.map(fmtDay), data: [{ label: '留言', data: days.map(d => counts.get(d)!), color: SERIES_GREEN }], total: [...counts.values()].reduce((a, b) => a + b, 0) }
})
const viewsSummary = computed(() => `各貼文觀看：${(series.value?.posts ?? []).map((p, i) => `${postLabels.value[i]} ${p.views}`).join('、')}`)
const partsSummary = computed(() => `各貼文互動組成：${(series.value?.posts ?? []).map((p, i) => `${postLabels.value[i]} 按讚 ${p.likes}、留言 ${p.comments}、分享 ${p.shares}、收藏 ${p.saves}`).join('；')}`)

async function send(c: CommentRow) {
  busyId.value = c.id
  const row = await attempt(() => api<CommentRow>(`/api/comments/${c.id}/send`, { method: 'POST' }), '已送出')
  busyId.value = 0
  if (row) Object.assign(c, row)
  else await load()
}
async function remove(c: CommentRow) {
  if (!confirm('刪除這筆留言紀錄？')) return
  if (await attempt(() => api(`/api/comments/${c.id}`, { method: 'DELETE' }))) comments.value = comments.value.filter(x => x.id !== c.id)
}
</script>

<template>
  <div v-if="missing" class="empty">找不到這個系列文。<NuxtLink to="/series">返回系列文管理</NuxtLink></div>
  <template v-else-if="series">
    <div class="row between">
      <div class="row" style="gap: 12px">
        <NuxtLink to="/series" class="btn-text" style="padding-left: 0">← 系列文管理</NuxtLink>
        <h1 class="wrap-any">{{ series.name }}</h1>
        <span v-if="series.replies.length && !series.enabled" class="pill muted">已暫停</span>
      </div>
      <button type="button" class="btn" @click="settingsOpen = true">設定系列文</button>
    </div>

    <div class="stats">
      <div class="stat"><span class="small muted">觀看</span><b>{{ fmtNum(totals.views) }}</b></div>
      <div class="stat"><span class="small muted">互動</span><b>{{ fmtNum(totals.engagement) }}</b></div>
      <div class="stat"><span class="small muted">互動率</span><b>{{ rate(totals.engagement, totals.views) }}</b></div>
      <div class="stat"><span class="small muted">收藏</span><b>{{ fmtNum(totals.saves) }}</b></div>
      <div class="stat"><span class="small muted">留言</span><b>{{ fmtNum(series.received) }} 則</b></div>
      <div class="stat"><span class="small muted">私訊送出</span><b>{{ fmtNum(series.dms) }} 則</b></div>
    </div>

    <div class="grid-2 series-detail">
      <section class="card">
        <h2>成效統計</h2>
        <template v-if="series.posts.length">
          <div class="col" style="gap: 6px">
            <h3 class="chart-title">各貼文觀看</h3>
            <BarChart horizontal value-labels :labels="postLabels" :datasets="viewsData" :height="rowsHeight - 30" :summary="viewsSummary" />
          </div>
          <div class="col" style="gap: 6px">
            <h3 class="chart-title">互動組成</h3>
            <BarChart horizontal stacked :labels="postLabels" :datasets="partsData" :height="rowsHeight + 14" :summary="partsSummary" />
          </div>
          <div class="col" style="gap: 6px">
            <h3 class="chart-title">每日留言<span class="small muted" style="font-weight: 400">　近 14 天</span></h3>
            <BarChart value-labels :labels="daily.labels" :datasets="daily.data" :height="170" :summary="`近 14 天每日留言數，合計 ${daily.total} 則`" />
          </div>
          <details>
            <summary class="small" style="cursor: pointer; min-height: 32px; display: flex; align-items: center; color: var(--green-deep)">資料表</summary>
            <div class="table-scroll">
              <table style="min-width: 560px">
                <thead>
                  <tr><th scope="col">貼文</th><th scope="col">發佈</th><th scope="col">觀看</th><th scope="col">按讚</th><th scope="col">留言</th><th scope="col">分享</th><th scope="col">收藏</th></tr>
                </thead>
                <tbody>
                  <tr v-for="(p, i) in series.posts" :key="p.id">
                    <th scope="row">{{ postLabels[i] }}
                      <div class="small" style="font-weight: 400"><a :href="p.url" target="_blank" rel="noopener noreferrer" style="color: var(--muted)">{{ p.text || '（沒有文字的貼文）' }}</a></div>
                    </th>
                    <td style="white-space: nowrap">{{ dayOf(p.publishedAt) }}</td>
                    <td>{{ fmtNum(p.views) }}</td>
                    <td>{{ fmtNum(p.likes) }}</td>
                    <td>{{ fmtNum(p.comments) }}</td>
                    <td>{{ fmtNum(p.shares) }}</td>
                    <td>{{ fmtNum(p.saves) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>
        </template>
        <div v-else class="empty">還沒有貼文　<button type="button" class="btn-text" @click="settingsOpen = true">加入貼文</button></div>
      </section>

      <section class="card">
        <div class="row between">
          <h2>留言紀錄</h2>
          <div class="row" role="group" aria-label="篩選留言">
            <button type="button" class="chip" :aria-pressed="filter === 'all'" @click="filter = 'all'">全部</button>
            <button type="button" class="chip" :aria-pressed="filter === 'failed'" @click="filter = 'failed'">送出失敗</button>
            <button type="button" class="chip" :aria-pressed="filter === 'open'" @click="filter = 'open'">未回覆</button>
          </div>
        </div>
        <!-- 留言紀錄在自己的區塊裡捲動 -->
        <div ref="logEl" class="comment-log" tabindex="0" aria-label="留言紀錄">
          <div v-for="c in shown" :key="c.id" class="comment-item">
            <div class="row between" style="gap: 6px 12px">
              <span class="small muted">{{ accountLabel(c.accountId).split(' · ')[0] }} · {{ c.author }} · {{ timeOf(c.createdAt) }}</span>
              <span class="tag" :style="stateOf(c).style">{{ stateOf(c).label }}</span>
            </div>
            <span class="wrap-any">{{ c.text }}</span>
            <div v-if="c.error" class="error">{{ c.error }}</div>
            <div class="row">
              <button v-if="c.status === 'ready' && c.externalId" type="button" class="btn sm" :disabled="busyId === c.id" @click="send(c)">{{ c.error ? '重送' : '送出回覆' }}</button>
              <button type="button" class="btn sm" :aria-label="`刪除 ${c.author} 的留言紀錄`" @click="remove(c)">刪除</button>
            </div>
          </div>
          <div v-if="!shown.length" class="empty">沒有紀錄</div>
        </div>
        <div v-if="pages > 1" class="row between" role="navigation" aria-label="留言紀錄分頁">
          <button type="button" class="btn sm" :disabled="page <= 1" @click="goPage(page - 1)">上一頁</button>
          <span class="small muted" aria-live="polite">第 {{ page }} / {{ pages }} 頁</span>
          <button type="button" class="btn sm" :disabled="page >= pages" @click="goPage(page + 1)">下一頁</button>
        </div>
      </section>
    </div>

    <SeriesDialog v-model="settingsOpen" :series="series" @saved="load" @deleted="backToList" />
  </template>
  <div v-else class="empty">載入中…</div>
</template>
