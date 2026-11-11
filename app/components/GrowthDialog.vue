<script setup lang="ts">
// 粉絲成長（儀表板點帳號開啟）：只呈現資料。「里程碑」是每成長一定數量花了幾天、期間發了什麼；
// 「期間比較」是自己選兩段日期互相比。算法在 shared/utils/growth.ts，MCP 工具用的是同一份
const open = defineModel<boolean>({ required: true })
const props = defineProps<{ account?: Account }>()
const mode = ref<'steps' | 'periods'>('steps')
const STEPS = [100, 500, 1000]
const step = ref(100)
const growth = ref<FollowerGrowth>()
const picked = ref<number | 'now'>('now')
const unit = computed(() => (props.account?.platform === 'youtube' ? '訂閱' : '粉絲'))

async function loadGrowth() {
  if (!props.account) return
  const data = await attempt(() => api<FollowerGrowth>(`/api/accounts/${props.account!.id}/growth`, { query: { step: step.value } }))
  if (!data) return
  growth.value = data
  picked.value = data.intervals.length ? 0 : 'now'
}
const maxDays = computed(() => Math.max(1, growth.value?.inProgress?.daysSoFar ?? 0, ...(growth.value?.intervals ?? []).map(i => i.days)))
const width = (days: number) => `${Math.max(2, Math.round(days / maxDays.value * 100))}%`
const latest = computed(() => growth.value?.intervals.find(i => !i.partial))
const shown = computed(() => {
  const g = growth.value
  if (!g) return undefined
  if (picked.value === 'now') return g.inProgress && { label: `${fmtNum(g.inProgress.from)} → ${fmtNum(g.inProgress.to)}`, range: `${fmtDay(g.inProgress.started)} – 今天`, days: g.inProgress.daysSoFar, posts: g.inProgress.posts }
  const i = g.intervals[picked.value]
  return i && { label: `${fmtNum(i.from)} → ${fmtNum(i.to)}`, range: `${fmtDay(i.started)} – ${fmtDay(i.reached)}`, days: i.days, posts: i.posts }
})
const sum = (posts: GrowthPost[], key: 'views' | 'engagement') => posts.reduce((a, p) => a + p[key], 0)
const versus = (n: number | null) => (n == null ? '—' : n < 0 ? `▲ 快 ${-n} 天` : n > 0 ? `▼ 慢 ${n} 天` : '一樣')
const versusClass = (n: number | null) => (n == null || n === 0 ? 'muted' : n < 0 ? 'trend-up' : 'trend-slow')
const pace = (posts: number, days: number) => (posts && days ? `平均每 ${(days / posts).toFixed(1).replace(/\.0$/, '')} 天發 1 則` : '')

// 期間比較：預設最近 30 天跟再之前的 30 天
const today = todayTaipei()
const ranges = reactive([
  { from: addDays(today, -59), to: addDays(today, -30) },
  { from: addDays(today, -29), to: today },
])
const periods = ref<PeriodSummary[]>([])
const periodError = ref('')
async function loadPeriods() {
  if (!props.account) return
  periodError.value = ''
  if (ranges.some(r => !r.from || !r.to)) return
  try {
    periods.value = await api<PeriodSummary[]>(`/api/accounts/${props.account.id}/periods`, { query: { ranges: ranges.map(r => `${r.from}:${r.to}`).join(',') } })
  }
  catch (e: any) {
    periodError.value = e.message
  }
}
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtNum(Math.abs(n))}`
const gainDiff = computed(() => (periods.value[0]?.gain != null && periods.value[1]?.gain != null ? periods.value[1]!.gain! - periods.value[0]!.gain! : null))
const recorded = (p: PeriodSummary) => (p.recordedFrom == null ? '這段期間沒有粉絲紀錄' : p.recordedFrom !== p.from || p.recordedTo !== p.to ? `粉絲紀錄只有 ${fmtDay(p.recordedFrom)} – ${fmtDay(p.recordedTo!)}` : '')

watch([open, () => props.account?.id], () => {
  if (!open.value) return
  growth.value = undefined
  periods.value = []
  mode.value = 'steps'
  loadGrowth()
})
watch(step, loadGrowth)
watch(mode, value => value === 'periods' && !periods.value.length && loadPeriods())
watch(ranges, loadPeriods)
</script>

<template>
  <PanelDialog v-model="open" en="Follower growth" :title="account?.name ?? ''">
    <template #icon><PlatformIcon :platform="account?.platform" :size="28" /></template>
    <template #head>
      <div v-if="growth?.followers != null" class="growth-now"><b>{{ fmtNum(growth.followers) }}</b><span class="small muted">{{ unit }}</span></div>
      <div class="grow" />
      <div class="seg" role="group" aria-label="檢視方式">
        <button type="button" :aria-pressed="mode === 'steps'" @click="mode = 'steps'">里程碑</button>
        <button type="button" :aria-pressed="mode === 'periods'" @click="mode = 'periods'">期間比較</button>
      </div>
    </template>

    <template v-if="mode === 'steps'">
      <div v-if="!growth" class="empty">載入中…</div>
      <div v-else-if="!growth.since" class="empty">還沒有{{ unit }}數的紀錄</div>
      <template v-else>
        <div class="growth-stats">
          <div class="growth-stat">
            <span class="small">最近完成的 {{ fmtNum(step) }} 人</span>
            <div class="row" style="align-items: baseline; gap: 10px">
              <b>{{ latest ? `${latest.days} 天` : '—' }}</b>
              <span v-if="latest?.vsPrevious != null" class="small bold" :class="versusClass(latest.vsPrevious)">{{ latest.vsPrevious < 0 ? `比前一個快 ${-latest.vsPrevious} 天` : latest.vsPrevious > 0 ? `比前一個慢 ${latest.vsPrevious} 天` : '跟前一個一樣' }}</span>
            </div>
          </div>
          <div class="growth-stat">
            <span class="small">平均每 {{ fmtNum(step) }} 人</span>
            <div class="row" style="align-items: baseline; gap: 10px">
              <b>{{ growth.averageDays != null ? `${growth.averageDays} 天` : '—' }}</b>
              <span class="small muted">{{ growth.intervals.filter(i => !i.partial).length }} 個區間</span>
            </div>
          </div>
          <div v-if="growth.inProgress" class="growth-stat">
            <div class="row between"><span class="small">下一個：{{ fmtNum(growth.inProgress.to) }}</span><span class="small muted">已經 {{ growth.inProgress.daysSoFar }} 天</span></div>
            <div class="row" style="gap: 12px; flex-wrap: nowrap">
              <div class="growth-track grow"><div :style="{ width: `${Math.min(100, Math.max(0, (growth.followers! - (growth.inProgress.to - step)) / step * 100))}%` }" /></div>
              <b style="font-size: 18px">{{ fmtNum(Math.max(0, growth.followers! - (growth.inProgress.to - step))) }} / {{ fmtNum(step) }}</b>
            </div>
          </div>
        </div>

        <div class="growth-cols">
          <section class="growth-box">
            <div class="row between">
              <div class="seg" role="group" aria-label="級距">
                <button v-for="s in STEPS" :key="s" type="button" :aria-pressed="step === s" @click="step = s">每 {{ fmtNum(s) }} 人</button>
              </div>
              <span class="small muted">紀錄從 {{ growth.since.replaceAll('-', '/') }} 開始</span>
            </div>
            <div class="growth-row head small muted"><span>區間</span><span>花了幾天</span><span>跟前一個比</span><span class="num">貼文</span></div>
            <div class="col scroll" style="gap: 8px; flex: 1 1 0; min-height: 0; overflow-y: auto">
              <button v-if="growth.inProgress" type="button" class="growth-row item now" :aria-pressed="picked === 'now'" @click="picked = 'now'">
                <span class="col" style="gap: 2px"><b>{{ fmtNum(growth.inProgress.from) }} → {{ fmtNum(growth.inProgress.to) }}</b><span class="small muted">{{ fmtDay(growth.inProgress.started) }} – 今天</span></span>
                <span class="growth-bar"><span class="pending" :style="{ width: width(growth.inProgress.daysSoFar) }" /><b>{{ growth.inProgress.daysSoFar }} 天</b></span>
                <span class="small muted">進行中</span>
                <span class="num">{{ growth.inProgress.posts.length }} 則</span>
              </button>
              <button v-for="(i, index) in growth.intervals" :key="i.to" type="button" class="growth-row item" :aria-pressed="picked === index" @click="picked = index">
                <span class="col" style="gap: 2px"><b>{{ fmtNum(i.from) }} → {{ fmtNum(i.to) }}</b><span class="small muted">{{ fmtDay(i.started) }} – {{ fmtDay(i.reached) }}</span></span>
                <span class="growth-bar"><span :style="{ width: width(i.days) }" /><b>{{ i.days }} 天</b></span>
                <span v-if="i.partial" class="small muted">從半路開始記</span>
                <span v-else class="small bold" :class="versusClass(i.vsPrevious)">{{ versus(i.vsPrevious) }}</span>
                <span class="num">{{ i.posts.length }} 則</span>
              </button>
            </div>
          </section>

          <section v-if="shown" class="growth-box">
            <div class="row" style="align-items: baseline; gap: 12px">
              <h2>{{ shown.label }} 期間發的貼文</h2>
              <span class="small muted">{{ shown.range }}・{{ shown.posts.length }} 則</span>
            </div>
            <div class="growth-post head small muted"><span>發布</span><span>貼文</span><span class="num">觀看</span><span class="num">互動</span></div>
            <div class="col scroll" style="flex: 1 1 0; min-height: 0; overflow-y: auto">
              <a v-for="p in shown.posts" :key="p.url + p.published" class="growth-post" :href="p.url || undefined" target="_blank" rel="noopener">
                <span class="muted">{{ fmtDay(p.published) }}</span><span class="ellipsis">{{ p.text || '（沒有文字）' }}</span><b class="num">{{ fmtNum(p.views) }}</b><span class="num">{{ fmtNum(p.engagement) }}</span>
              </a>
              <div v-if="!shown.posts.length" class="empty">這段期間沒有發文</div>
            </div>
            <div v-if="shown.posts.length" class="growth-total">
              <span>這段期間合計</span>
              <span class="row" style="gap: 6px 22px"><span>觀看 <b>{{ fmtNum(sum(shown.posts, 'views')) }}</b></span><span>互動 <b>{{ fmtNum(sum(shown.posts, 'engagement')) }}</b></span><span>{{ pace(shown.posts.length, shown.days) }}</span></span>
            </div>
          </section>
        </div>
      </template>
    </template>

    <template v-else>
      <div v-if="periodError" class="error" role="alert">{{ periodError }}</div>
      <div class="growth-cols even">
        <section v-for="(r, index) in ranges" :key="index" class="growth-box">
          <div class="row" style="gap: 10px; align-items: flex-end">
            <span class="pill" :class="{ muted: index === 0 }">{{ index === 0 ? '期間 A' : '期間 B' }}</span>
            <label class="field grow">開始<input v-model="r.from" type="date" :max="r.to" required></label>
            <label class="field grow">結束<input v-model="r.to" type="date" :min="r.from" required></label>
          </div>
          <template v-if="periods[index]">
            <div class="growth-period">
              <div class="growth-stat">
                <span class="small">{{ unit }}增減</span>
                <div class="row" style="align-items: baseline; gap: 10px">
                  <b>{{ periods[index]!.gain != null ? signed(periods[index]!.gain!) : '—' }}</b>
                  <span v-if="index === 1 && gainDiff != null" class="small bold" :class="gainDiff > 0 ? 'trend-up' : gainDiff < 0 ? 'trend-slow' : 'muted'">{{ gainDiff > 0 ? `▲ 比 A 多 ${fmtNum(gainDiff)}` : gainDiff < 0 ? `▼ 比 A 少 ${fmtNum(-gainDiff)}` : '跟 A 一樣' }}</span>
                </div>
                <span class="small muted">{{ periods[index]!.startFollowers != null ? `${fmtNum(periods[index]!.startFollowers!)} → ${fmtNum(periods[index]!.endFollowers!)}` : '' }}</span>
              </div>
              <div class="growth-stat">
                <span class="small">平均每天</span>
                <b>{{ periods[index]!.perDay != null ? signed(periods[index]!.perDay!) : '—' }}</b>
                <span class="small muted">{{ periods[index]!.days }} 天</span>
              </div>
              <div class="growth-stat">
                <span class="small">發文</span>
                <b>{{ periods[index]!.posts.length }} 則</b>
                <span class="small muted">觀看 {{ fmtNum(periods[index]!.views) }}・互動 {{ fmtNum(periods[index]!.engagement) }}</span>
              </div>
            </div>
            <div v-if="recorded(periods[index]!)" class="note">{{ recorded(periods[index]!) }}</div>
            <div class="growth-post head small muted"><span>發布</span><span>貼文</span><span class="num">觀看</span><span class="num">互動</span></div>
            <div class="col scroll" style="flex: 1 1 0; min-height: 0; overflow-y: auto">
              <a v-for="p in periods[index]!.posts" :key="p.url + p.published" class="growth-post" :href="p.url || undefined" target="_blank" rel="noopener">
                <span class="muted">{{ fmtDay(p.published) }}</span><span class="ellipsis">{{ p.text || '（沒有文字）' }}</span><b class="num">{{ fmtNum(p.views) }}</b><span class="num">{{ fmtNum(p.engagement) }}</span>
              </a>
              <div v-if="!periods[index]!.posts.length" class="empty">這段期間沒有發文</div>
            </div>
          </template>
        </section>
      </div>
    </template>
  </PanelDialog>
</template>
