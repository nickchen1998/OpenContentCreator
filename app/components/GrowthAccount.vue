<script setup lang="ts">
// 粉絲成長裡的一個帳號：近 N 天成長率、跟前 N 天比（N 是儀表板上方選的期間）、每成長一個級距花了幾天。
// 級距依帳號大小自動選（不放選單）；里程碑只列最近幾段，點一列在原地展開那段期間發的貼文
const props = defineProps<{ account: Account, days: number, now?: { followers: number, change: number | null } }>()
const unit = computed(() => (props.account.platform === 'youtube' ? '訂閱' : '粉絲'))
const step = computed(() => {
  const n = props.now?.followers ?? 0
  return n < 5_000 ? 100 : n < 50_000 ? 500 : 1_000
})
const SHOW = 4

const growth = ref<FollowerGrowth>()
const periods = ref<PeriodSummary[]>([])
const opened = ref<number | 'now' | null>(null)
async function load() {
  const id = props.account.id
  const today = todayTaipei()
  const n = props.days
  // 前 N 天（A）跟近 N 天（B），跟上方數字的比法一樣
  const ranges = `${addDays(today, -(2 * n - 1))}:${addDays(today, -n)},${addDays(today, -(n - 1))}:${today}`
  const [g, p] = await Promise.all([
    attempt(() => api<FollowerGrowth>(`/api/accounts/${id}/growth`, { query: { step: step.value } })),
    attempt(() => api<PeriodSummary[]>(`/api/accounts/${id}/periods`, { query: { ranges } })),
  ])
  growth.value = g
  periods.value = p ?? []
  opened.value = null
}
watch([() => props.account.id, () => props.days, step], load, { immediate: true })

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtNum(Math.abs(n))}`
// 近 N 天成長率：增減 ÷ 期間開始那天的人數
const rate = computed(() => {
  const f = props.now
  if (!f || f.change == null) return null
  const base = f.followers - f.change
  return { change: f.change, base, pct: base > 0 ? f.change / base * 100 : null }
})
const versusPrev = computed(() => {
  const [a, b] = periods.value
  if (a?.gain == null || b?.gain == null) return null
  return { before: a.gain, diff: b.gain - a.gain }
})
const latest = computed(() => growth.value?.intervals.find(i => !i.partial))
const recent = computed(() => growth.value?.intervals.slice(0, SHOW) ?? [])
const maxDays = computed(() => Math.max(1, growth.value?.inProgress?.daysSoFar ?? 0, ...recent.value.map(i => i.days)))
const width = (days: number) => `${Math.max(2, Math.round(days / maxDays.value * 100))}%`
const versus = (n: number | null) => (n == null ? '—' : n < 0 ? `▲ 快 ${-n} 天` : n > 0 ? `▼ 慢 ${n} 天` : '一樣')
const versusClass = (n: number | null) => (n == null || n === 0 ? 'muted' : n < 0 ? 'trend-up' : 'trend-slow')
const toggle = (key: number | 'now') => { opened.value = opened.value === key ? null : key }
</script>

<template>
  <div class="gp-account">
    <div class="row between">
      <span class="row" style="gap: 8px"><PlatformIcon :platform="account.platform" :size="18" /><b class="gp-name">{{ account.name }}</b></span>
      <span v-if="now" class="small muted">{{ unit }} <b style="color: var(--ink)">{{ fmtNum(now.followers) }}</b></span>
    </div>
    <div class="gp-stats">
      <div class="gp-stat">
        <span class="small muted">近 {{ days }} 天成長率</span>
        <b :class="rate && rate.change > 0 ? 'trend-up' : rate && rate.change < 0 ? 'trend-down' : ''">{{ rate?.pct != null ? `${rate.pct > 0 ? '+' : ''}${rate.pct.toFixed(1)}%` : '—' }}</b>
        <span class="small muted">{{ rate ? `${signed(rate.change)} 人` : '紀錄還不夠久' }}</span>
      </div>
      <div class="gp-stat">
        <span class="small muted">比前 {{ days }} 天</span>
        <b :class="versusPrev && versusPrev.diff > 0 ? 'trend-up' : versusPrev && versusPrev.diff < 0 ? 'trend-slow' : ''">{{ versusPrev ? (versusPrev.diff > 0 ? `多 ${fmtNum(versusPrev.diff)}` : versusPrev.diff < 0 ? `少 ${fmtNum(-versusPrev.diff)}` : '一樣') : '—' }}</b>
        <span class="small muted">{{ versusPrev ? `前 ${days} 天 ${signed(versusPrev.before)} 人` : '紀錄還不夠久' }}</span>
      </div>
      <div class="gp-stat">
        <span class="small muted">最近每 {{ fmtNum(step) }} 人</span>
        <b>{{ latest ? `${latest.days} 天` : '—' }}</b>
        <span class="small" :class="versusClass(latest?.vsPrevious ?? null)">{{ latest?.vsPrevious != null ? (latest.vsPrevious < 0 ? `比前一個快 ${-latest.vsPrevious} 天` : latest.vsPrevious > 0 ? `比前一個慢 ${latest.vsPrevious} 天` : '跟前一個一樣') : growth?.averageDays != null ? `平均 ${growth.averageDays} 天` : '　' }}</span>
      </div>
    </div>
    <template v-if="growth?.since">
      <template v-if="growth.inProgress">
        <button type="button" class="gp-row now" :aria-expanded="opened === 'now'" @click="toggle('now')">
          <span class="col" style="gap: 0"><b>{{ fmtNum(growth.inProgress.from) }} → {{ fmtNum(growth.inProgress.to) }}</b><span class="small muted">{{ fmtDay(growth.inProgress.started) }} – 今天</span></span>
          <span class="growth-bar"><span class="pending" :style="{ width: width(growth.inProgress.daysSoFar) }" /><b>{{ growth.inProgress.daysSoFar }} 天</b></span>
          <span class="small muted">進行中</span>
          <span class="num small">{{ growth.inProgress.posts.length }} 則</span>
        </button>
        <GrowthPosts v-if="opened === 'now'" :posts="growth.inProgress.posts" />
      </template>
      <template v-for="(i, index) in recent" :key="i.to">
        <button type="button" class="gp-row" :aria-expanded="opened === index" @click="toggle(index)">
          <span class="col" style="gap: 0"><b>{{ fmtNum(i.from) }} → {{ fmtNum(i.to) }}</b><span class="small muted">{{ fmtDay(i.started) }} – {{ fmtDay(i.reached) }}</span></span>
          <span class="growth-bar"><span :style="{ width: width(i.days) }" /><b>{{ i.days }} 天</b></span>
          <span v-if="i.partial" class="small muted">半路開始記</span>
          <span v-else class="small bold" :class="versusClass(i.vsPrevious)">{{ versus(i.vsPrevious) }}</span>
          <span class="num small">{{ i.posts.length }} 則</span>
        </button>
        <GrowthPosts v-if="opened === index" :posts="i.posts" />
      </template>
      <span class="small muted">紀錄從 {{ fmtDay(growth.since) }} 開始<template v-if="growth.intervals.length > SHOW">・只列最近 {{ SHOW }} 段</template></span>
    </template>
    <div v-else-if="growth" class="small muted">還沒有{{ unit }}數的紀錄</div>
  </div>
</template>
