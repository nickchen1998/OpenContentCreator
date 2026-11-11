<script setup lang="ts">
// 系列文的成效：合計、系列裡每則貼文、留言紀錄
const id = Number(useRoute().params.id)
const { accountLabel, account } = useLookup()
const series = ref<Series>()
const comments = ref<CommentRow[]>([])
const missing = ref(false)
const settingsOpen = ref(false)
const waitingOnly = ref(false)
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
// 橫條圖的高度跟著貼文數走，但有上限：貼文很多時寧可條細一點，也不要把頁面撐長
const rowsHeight = computed(() => Math.min(190, Math.max(84, (series.value?.posts.length ?? 0) * 30 + 34)))
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
const viewsSummary = computed(() => `各貼文觀看：${(series.value?.posts ?? []).map((p, i) => `${postLabels.value[i]} ${p.views}`).join('、')}`)
const partsSummary = computed(() => `各貼文互動組成：${(series.value?.posts ?? []).map((p, i) => `${postLabels.value[i]} 按讚 ${p.likes}、留言 ${p.comments}、分享 ${p.shares}、收藏 ${p.saves}`).join('；')}`)

</script>

<template>
  <div v-if="missing" class="empty">找不到這個系列文。<NuxtLink to="/series">返回系列文管理</NuxtLink></div>
  <template v-else-if="series">
    <div class="row between">
      <div class="row" style="gap: 12px">
        <NuxtLink to="/series" class="btn-text" style="padding-left: 0">← 系列文管理</NuxtLink>
        <h1 class="wrap-any">{{ series.name }}</h1>
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
            <h3 class="chart-title">各貼文觀看</h3>
            <BarChart horizontal value-labels :labels="postLabels" :datasets="viewsData" :height="rowsHeight" :summary="viewsSummary" />
          </div>
          <div class="col" style="gap: 4px">
            <h3 class="chart-title">互動組成</h3>
            <BarChart horizontal stacked :labels="postLabels" :datasets="partsData" :height="rowsHeight + 34" :summary="partsSummary" />
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
        <div class="row between">
          <h2>留言紀錄</h2>
          <button type="button" class="chip" :aria-pressed="waitingOnly" @click="waitingOnly = !waitingOnly">只看待回覆</button>
        </div>
        <ConversationList :rows="comments" show-platform :waiting-only="waitingOnly" @changed="load" />
      </section>
    </div>

    <SeriesDialog v-model="settingsOpen" :series="series" @saved="load" @deleted="backToList" />
  </template>
  <div v-else class="empty">載入中…</div>
</template>
