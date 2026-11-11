<script setup lang="ts">
// 系列文的成效：合計、系列裡每則貼文、留言紀錄
const id = Number(useRoute().params.id)
const { account } = useLookup()
const series = ref<Series>()
const comments = ref<CommentRow[]>([])
const missing = ref(false)
const settingsOpen = ref(false)
const syncing = ref(false)
// 只同步這個系列文裡的貼文（成效數字與留言）。一次最多 8 則，貼文更多時會提示再按一次
async function sync() {
  syncing.value = true
  const r = await attempt(() => api<{ synced: number, total: number, errors: string[] }>(`/api/series/${id}/sync`, { method: 'POST' }))
  syncing.value = false
  if (!r) return
  notify(r.errors.length ? r.errors.join('；') : r.total > r.synced ? `已同步 ${r.synced}／${r.total} 則，再按一次繼續` : '已同步')
  await load(true)
}
const backToList = () => navigateTo('/series')

async function load(quiet = false) {
  try {
    const data = await api<{ series: Series, comments: CommentRow[] }>(`/api/series/${id}`)
    series.value = data.series
    comments.value = data.comments
  }
  catch {
    // 自動更新時遇到暫時的錯誤就維持原本的畫面，不要變成「找不到」
    if (!quiet) missing.value = true
  }
}
onMounted(() => load())
useAutoRefresh(() => load(true))

const totals = computed(() => totalsOf(series.value?.posts ?? []))
const rate = (eng: number, views: number) => (views ? `${(eng / views * 100).toFixed(1)}%` : '—')
const dayOf = (iso: string) => fmtDay(minutesToAt(Math.floor(Date.parse(iso) / 60000) + 480).slice(0, 10))
// 成效統計的圖表資料
const SERIES_GREEN = '#3e5346'
// 互動組成的四個顏色經過色盲辨識度檢查（dataviz 的 validate_palette），順序固定不要調換
const PARTS = [
  { key: 'likes', label: '按讚', color: '#1baf7a' },
  { key: 'comments', label: '留言', color: '#eb6834' },
  { key: 'shares', label: '分享', color: '#6250d6' },
  { key: 'saves', label: '收藏', color: '#eda100' },
] as const
// 每則貼文的名稱：平台縮寫＋日期＋開頭幾個字。同一天同平台發好幾則時，光靠平台和日期分不出來
const labelOf = (p: InsightPost) => {
  const platform = account(p.accountId)?.platform
  const head = p.text.replace(/\s+/g, ' ').trim()
  return `${platform ? PLATFORMS[platform].short : ''} ${dayOf(p.publishedAt)}${head ? ` ${head.length > 7 ? `${head.slice(0, 7)}…` : head}` : ''}`.trim()
}
const postLabels = computed(() => (series.value?.posts ?? []).map(labelOf))
// 圖表最多畫 CHART_ROWS 條：貼文更多時只畫觀看最高的幾則，其餘合併成一條「其他」（每一則的數字在資料表）
const CHART_ROWS = 8
const chartRows = computed(() => {
  const list = [...(series.value?.posts ?? [])].sort((a, b) => b.views - a.views || engagementOf(b) - engagementOf(a))
  const rows = list.map(p => ({ label: labelOf(p), views: p.views, likes: p.likes, comments: p.comments, shares: p.shares, saves: p.saves }))
  if (rows.length <= CHART_ROWS) return { rows, top: 0 }
  const top = rows.slice(0, CHART_ROWS - 1)
  const rest = rows.slice(CHART_ROWS - 1)
  const sum = (key: 'views' | 'likes' | 'comments' | 'shares' | 'saves') => rest.reduce((a, r) => a + r[key], 0)
  return { rows: [...top, { label: `其他 ${rest.length} 則`, views: sum('views'), likes: sum('likes'), comments: sum('comments'), shares: sum('shares'), saves: sum('saves') }], top: top.length }
})
const chartLabels = computed(() => chartRows.value.rows.map(r => r.label))
const viewsData = computed(() => [{ label: '觀看', data: chartRows.value.rows.map(r => r.views), color: SERIES_GREEN }])
const partsData = computed(() => PARTS.map(part => ({ label: part.label, data: chartRows.value.rows.map(r => r[part.key]), color: part.color })))
// 橫條圖的高度跟著條數走（最多 CHART_ROWS 條，所以不會把頁面撐長）
const rowsHeight = computed(() => Math.max(84, chartRows.value.rows.length * 24 + 34))
const view = ref<'chart' | 'table'>('chart')
const daily = computed(() => {
  const today = todayTaipei()
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13))
  const counts = new Map(days.map(d => [d, 0]))
  for (const c of comments.value) {
    if (c.mine) continue
    const day = minutesToAt(Math.floor(Date.parse(c.createdAt) / 60000) + 480).slice(0, 10)
    if (counts.has(day)) counts.set(day, counts.get(day)! + 1)
  }
  return { labels: days.map(fmtDay), data: [{ label: '留言', data: days.map(d => counts.get(d)!), color: SERIES_GREEN }], total: [...counts.values()].reduce((a, b) => a + b, 0) }
})
const viewsSummary = computed(() => `各貼文觀看：${chartRows.value.rows.map(r => `${r.label} ${r.views}`).join('、')}`)
const partsSummary = computed(() => `各貼文互動組成：${chartRows.value.rows.map(r => `${r.label} 按讚 ${r.likes}、留言 ${r.comments}、分享 ${r.shares}、收藏 ${r.saves}`).join('；')}`)

</script>

<template>
  <div v-if="missing" class="empty">找不到這個系列文。<NuxtLink to="/series">返回系列文管理</NuxtLink></div>
  <template v-else-if="series">
    <div class="row between">
      <div class="row" style="gap: 12px">
        <NuxtLink to="/series" class="btn-text" style="padding-left: 0">← 系列文管理</NuxtLink>
        <h1 class="wrap-any">{{ series.name }}</h1>
      </div>
      <div class="row">
        <button type="button" class="btn" :disabled="syncing || !series.posts.length" @click="sync">{{ syncing ? '同步中…' : '立即同步' }}</button>
        <button type="button" class="btn" @click="settingsOpen = true">設定系列文</button>
      </div>
    </div>

    <div class="stats">
      <div class="stat"><span class="small muted">觀看</span><b>{{ fmtNum(totals.views) }}</b></div>
      <div class="stat"><span class="small muted">互動</span><b>{{ fmtNum(totals.engagement) }}</b></div>
      <div class="stat"><span class="small muted">互動率</span><b>{{ rate(totals.engagement, totals.views) }}</b></div>
      <div class="stat"><span class="small muted">收藏</span><b>{{ fmtNum(totals.saves) }}</b></div>
      <div class="stat"><span class="small muted">留言</span><b>{{ fmtNum(series.received) }} 則</b></div>
      <div class="stat"><span class="small muted">私訊送出</span><b>{{ fmtNum(series.dms) }} 則</b></div>
    </div>

    <div class="fit-grid cols-2 fill">
      <section class="card">
        <div class="row between">
          <h2>成效統計</h2>
          <div v-if="series.posts.length" class="seg" role="group" aria-label="顯示方式">
            <button type="button" :aria-pressed="view === 'chart'" @click="view = 'chart'">圖表</button>
            <button type="button" :aria-pressed="view === 'table'" @click="view = 'table'">資料表</button>
          </div>
        </div>
        <div v-if="!series.posts.length" class="empty">還沒有貼文　<button type="button" class="btn-text" @click="settingsOpen = true">加入貼文</button></div>
        <div v-else-if="view === 'chart'" class="charts fill scroll">
          <div class="col" style="gap: 4px">
            <h3 class="chart-title">各貼文觀看<span v-if="chartRows.top" class="small muted" style="font-weight: 400">　觀看最高的 {{ chartRows.top }} 則</span></h3>
            <BarChart horizontal value-labels :labels="chartLabels" :datasets="viewsData" :height="rowsHeight" :summary="viewsSummary" />
          </div>
          <div class="col" style="gap: 4px">
            <h3 class="chart-title">互動組成</h3>
            <BarChart horizontal stacked :labels="chartLabels" :datasets="partsData" :height="rowsHeight + 34" :summary="partsSummary" />
          </div>
          <div class="chart-fill">
            <h3 class="chart-title">每日留言<span class="small muted" style="font-weight: 400">　近 14 天</span></h3>
            <BarChart fill value-labels :labels="daily.labels" :datasets="daily.data" :summary="`近 14 天每日留言數，合計 ${daily.total} 則`" />
          </div>
        </div>
        <div v-else class="table-scroll fill scroll">
          <table style="min-width: 520px">
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
      </section>

      <section class="card">
        <h2>留言紀錄</h2>
        <ConversationList :rows="comments" show-platform @changed="load()" />
      </section>
    </div>

    <SeriesDialog v-model="settingsOpen" :series="series" @saved="load()" @deleted="backToList" />
  </template>
  <div v-else class="empty">載入中…</div>
</template>
