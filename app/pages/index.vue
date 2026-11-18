<script setup lang="ts">
// 儀表板：最上面一行是粉絲數＋這段期間的成效（跟前一段期間比），左邊是表現最好的貼文與發文時段，右邊是粉絲成長
const boot = useBoot()
const days = ref(28)
// 右上角的平台篩選：所有數字都只算那個平台（待回覆與私訊由伺服器篩，其餘在這裡篩貼文）
const platform = ref<Platform | 'all'>('all')
const platforms = computed(() => PLATFORM_KEYS.filter(k => boot.value.accounts.some(a => a.platform === k)))
const inPlatform = (accountId: number) => platform.value === 'all' || account(accountId)?.platform === platform.value
const allPosts = ref<InsightPost[]>([]) // 兩倍期間的貼文：後半是這個期間，前半拿來比較
type RecentPost = { accountId: number, publishedAt: string, likes: number, comments: number, shares: number }
const recent = ref<RecentPost[]>([]) // 不分期間的最近貼文（新的在前），熱度圖用
interface Status { accountId: number, lastSyncedAt: string | null, lastError: string, tokenExpiresAt: string | null }
const status = ref<Status[]>([])
const todo = ref({ waiting: 0, oldestWaitAt: null as string | null, failed: 0, failedIn: '', failedSeriesId: null as number | null, bySeries: {} as Record<number, number> })
// 各帳號目前的粉絲數與這段期間的增減（紀錄還不夠久時 change 是 null）
const followers = ref<Record<number, { followers: number, change: number | null }>>({})
const syncing = ref(false)
const loaded = ref(false)
const { account } = useLookup()

async function load() {
  const only = platform.value === 'all' ? {} : { platform: platform.value }
  const data = await attempt(() => api<{ posts: InsightPost[], recent: RecentPost[], status: Status[], todo: typeof todo.value, followers: typeof followers.value }>('/api/insights', { query: { days: days.value, ...only } }))
  if (data) {
    allPosts.value = data.posts
    recent.value = data.recent
    status.value = data.status
    todo.value = data.todo
    followers.value = data.followers
  }
  loaded.value = true
}
watch([days, platform], load, { immediate: true })
useAutoRefresh(load)

async function sync() {
  syncing.value = true
  const ok = await syncAll()
  syncing.value = false
  if (ok) await load()
}

const connected = computed(() => status.value.length > 0)
const lastSynced = computed(() => {
  const latest = status.value.map(s => s.lastSyncedAt).filter(Boolean).sort().at(-1)
  return latest ? minutesToAt(Math.floor(Date.parse(latest) / 60000) + 480).replace('T', ' ').slice(5) : ''
})
const rate = (eng: number, views: number) => (views ? `${(eng / views * 100).toFixed(1)}%` : '—')
const taipei = (iso: string) => minutesToAt(Math.floor(Date.parse(iso) / 60000) + 480)

// ---- 有狀況才出現的提示 ----
const linkErrors = computed(() => status.value.filter(s => s.lastError))

// ---- 這個期間 vs 前一個期間（各自是「那段期間發的貼文」的累計數字）----
const since = computed(() => new Date(Date.now() - days.value * 86400_000).toISOString())
const shown = computed(() => allPosts.value.filter(p => inPlatform(p.accountId)))
const posts = computed(() => shown.value.filter(p => p.publishedAt >= since.value))
const before = computed(() => shown.value.filter(p => p.publishedAt < since.value))
const kpis = computed(() => {
  const now = totalsOf(posts.value)
  const prev = totalsOf(before.value)
  const sum = (list: InsightPost[], key: 'comments' | 'shares' | 'saves') => list.reduce((a, p) => a + p[key], 0)
  const trend = (diff: number, text: string) => ({ text: `${diff > 0 ? '▲' : diff < 0 ? '▼' : '—'} ${text}`, dir: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat' })
  const none = { text: `前 ${days.value} 天沒有貼文`, dir: 'flat' }
  const viewsDiff = now.views - prev.views
  // 留言、分享、收藏：這段期間發的貼文的累計，跟前一段期間比差幾則
  const count = (label: string, key: 'comments' | 'shares' | 'saves', unit: string) => {
    const diff = sum(posts.value, key) - sum(before.value, key)
    return { label, value: `${fmtNum(sum(posts.value, key))} ${unit}`, delta: prev.posts ? trend(diff, `${fmtNum(Math.abs(diff))} ${unit}`) : none }
  }
  return [
    fans.value,
    { label: '觀看', value: fmtNum(now.views), delta: prev.views ? trend(viewsDiff, `${Math.abs(Math.round(viewsDiff / prev.views * 100))}%　比前 ${days.value} 天`) : none },
    count('留言', 'comments', '則'),
    count('分享', 'shares', '次'),
    count('收藏', 'saves', '次'),
  ]
})

// 粉絲數：所選平台各帳號加總；增減要每個帳號都有「期間開始那天或更早」的紀錄才算，不夠久就不顯示（不估算）
const fans = computed(() => {
  const list = boot.value.accounts.filter(a => inPlatform(a.id)).map(a => followers.value[a.id])
  const known = list.filter(f => f != null)
  if (!known.length) return { label: '粉絲數', value: '—', delta: { text: '還沒有紀錄', dir: 'flat' } }
  const total = known.reduce((a, f) => a + f.followers, 0)
  const complete = known.length === list.length && known.every(f => f.change != null)
  const change = known.reduce((a, f) => a + (f.change ?? 0), 0)
  return {
    label: '粉絲數',
    value: fmtNum(total),
    delta: complete
      ? { text: `${change > 0 ? '▲' : change < 0 ? '▼' : '—'} ${fmtNum(Math.abs(change))}　比 ${days.value} 天前`, dir: change > 0 ? 'up' : change < 0 ? 'down' : 'flat' }
      : { text: '紀錄還不夠久', dir: 'flat' },
  }
})
// 右邊的粉絲成長：所選平台的帳號，一次看一個
const shownAccounts = computed(() => boot.value.accounts.filter(a => inPlatform(a.id)))

// ---- 表現最好的貼文：跟同一個帳號這段期間的平均比 ----
const top = computed(() => {
  const average = new Map<number, number>()
  for (const id of new Set(posts.value.map(p => p.accountId))) {
    const list = posts.value.filter(p => p.accountId === id)
    // 貼文太少時「平均」沒有意義，不比
    if (list.length >= 3) average.set(id, list.reduce((a, p) => a + p.views, 0) / list.length)
  }
  return [...posts.value].filter(p => p.views > 0).sort((a, b) => b.views - a.views).slice(0, 4).map((p) => {
    const mean = average.get(p.accountId)
    const times = mean ? p.views / mean : 0
    return { ...p, platform: account(p.accountId)?.platform, day: fmtDay(taipei(p.publishedAt).slice(0, 10)), times: times >= 1.2 ? times.toFixed(1) : '', seriesName: p.seriesName ?? '' }
  })
})

// ---- 互動最好的發文時段：星期 × 早午晚 ----
// 不跟著上面的期間走：每個帳號取最近 30 則貼文（發文少的平台也畫得出來）。不用觀看數（舊貼文不會再抓），
// 每則的互動數先除以同帳號這 30 則的平均，格子是那個時段的平均倍數，不同平台、不同大小的帳號才能放在一起比
const HEAT_POSTS = 30
const SLOTS = [{ label: '早', from: 5, to: 12 }, { label: '午', from: 12, to: 18 }, { label: '晚', from: 18, to: 29 }]
const SHADES = ['#dfe7da', '#b9c9b1', '#7f9a78', '#3e5346']
const heat = computed(() => {
  const byAccount = new Map<number, RecentPost[]>()
  for (const p of recent.value) {
    if (!inPlatform(p.accountId)) continue
    const list = byAccount.get(p.accountId) ?? []
    if (list.length < HEAT_POSTS) byAccount.set(p.accountId, [...list, p])
  }
  const cells = new Map<string, { score: number, n: number }>()
  for (const list of byAccount.values()) {
    const mean = list.reduce((a, p) => a + engagementOf(p), 0) / list.length
    if (!mean) continue
    for (const p of list) {
      const at = taipei(p.publishedAt)
      const hour = Number(at.slice(11, 13))
      const slot = SLOTS.findIndex(s => (hour < 5 ? hour + 24 : hour) >= s.from && (hour < 5 ? hour + 24 : hour) < s.to)
      // 凌晨發的算前一天晚上
      const day = (weekdayIdx(at.slice(0, 10)) + (hour < 5 ? 6 : 0)) % 7
      const cell = cells.get(`${slot}:${day}`) ?? { score: 0, n: 0 }
      cells.set(`${slot}:${day}`, { score: cell.score + engagementOf(p) / mean, n: cell.n + 1 })
    }
  }
  const values = [...cells.values()].map(c => c.score / c.n).sort((a, b) => a - b)
  const level = (r: number) => Math.min(SHADES.length - 1, Math.floor(values.filter(x => x < r).length / values.length * SHADES.length))
  let best = { label: '', times: 0 }
  const rows = SLOTS.map((s, si) => ({
    label: s.label,
    cells: WEEKDAYS.map((d, di) => {
      const c = cells.get(`${si}:${di}`)
      if (!c) return { key: `${si}:${di}`, style: 'background: var(--green-faint)', title: `週${d}${s.label}：沒有貼文` }
      const times = c.score / c.n
      if (times > best.times) best = { label: `週${d}${s.label}`, times }
      return { key: `${si}:${di}`, style: `background: ${SHADES[level(times)]}`, title: `週${d}${s.label}：${c.n} 則，互動是平均的 ${times.toFixed(1)} 倍` }
    }),
  }))
  // 貼文太少時格子大多是空的，看了會誤導，不顯示
  const count = [...cells.values()].reduce((a, c) => a + c.n, 0)
  return { rows, show: count >= 8, summary: best.label ? `各帳號最近 ${HEAT_POSTS} 則貼文，${best.label}發的互動最好（平均的 ${best.times.toFixed(1)} 倍）` : '' }
})

</script>

<template>
  <div class="row between">
    <div class="row" role="group" aria-label="期間">
      <button type="button" class="chip" :aria-pressed="days === 7" @click="days = 7">近 7 天</button>
      <button type="button" class="chip" :aria-pressed="days === 28" @click="days = 28">近 28 天</button>
      <button type="button" class="chip" :aria-pressed="days === 90" @click="days = 90">近 90 天</button>
    </div>
    <div class="row">
      <div v-if="platforms.length > 1" class="row" role="group" aria-label="平台" style="gap: 6px">
        <button type="button" class="chip" :aria-pressed="platform === 'all'" @click="platform = 'all'">全部平台</button>
        <button v-for="k in platforms" :key="k" type="button" class="chip" :aria-pressed="platform === k" :aria-label="PLATFORMS[k].label" :title="PLATFORMS[k].label" @click="platform = k"><PlatformIcon :platform="k" /></button>
      </div>
      <NuxtLink v-if="todo.failed" :to="todo.failedSeriesId ? `/series/${todo.failedSeriesId}` : '/feed'" class="alert-chip">{{ todo.failed }} 則送出失敗</NuxtLink>
      <a v-if="linkErrors.length" href="/accounts" class="alert-chip" :title="linkErrors[0]?.lastError" @click.prevent="openSetup('accounts')">{{ linkErrors.length }} 個連結異常</a>
      <span v-if="lastSynced" class="small muted">更新於 {{ lastSynced }}</span>
      <button type="button" class="btn" :disabled="syncing || !connected" @click="sync">{{ syncing ? '同步中…' : '立即同步' }}</button>
    </div>
  </div>

  <div v-if="loaded && !connected" class="card empty">
    還沒有連結帳號　<a href="/accounts" @click.prevent="openSetup('accounts')">前往連結</a>
  </div>

  <!-- 一行五格：粉絲數與這段期間的成效，都跟著平台篩選。送出失敗、連結異常平常不占位置，有狀況才出現在上面那一列 -->
  <div class="stats">
    <div v-for="k in kpis" :key="k.label" class="stat">
      <span class="small muted">{{ k.label }}</span><b>{{ k.value }}</b>
      <span class="small" :class="`trend-${k.delta.dir}`">{{ k.delta.text }}</span>
    </div>
  </div>

  <div class="fit-grid cols-2 fill">
    <section class="card">
      <div class="row between">
        <h2>表現最好的貼文</h2>
        <NuxtLink to="/feed" class="btn sm">全部貼文</NuxtLink>
      </div>
      <div class="col fill scroll" style="gap: 12px">
        <div class="col divided" style="gap: 8px">
          <NuxtLink v-for="p in top" :key="p.id" :to="`/feed?post=${p.id}`" class="top-post">
            <span class="col" style="gap: 0; min-width: 0">
              <span class="top-text">{{ p.text || '（沒有文字的貼文）' }}</span>
              <span class="small muted pf-row" style="gap: 4px 10px"><PlatformIcon :platform="p.platform" :size="13" /><span>{{ p.day }}</span><span>互動率 {{ rate(engagementOf(p), p.views) }}</span><span v-if="p.seriesName" class="bold" style="color: var(--green-deep)">{{ p.seriesName }}</span></span>
            </span>
            <span class="col" style="gap: 2px; align-items: flex-end; flex: none">
              <span class="bold">{{ fmtNum(p.views) }}</span>
              <span v-if="p.times" class="tag" style="background: var(--green-soft); color: var(--green-deep)">平均的 {{ p.times }} 倍</span>
            </span>
          </NuxtLink>
          <div v-if="!top.length" class="empty">這段期間還沒有貼文的成效</div>
        </div>
        <div v-if="heat.show" class="col heat-wrap" style="gap: 6px">
          <h3>互動最好的發文時段</h3>
          <div class="heat" role="img" :aria-label="heat.summary">
            <span /><span v-for="d in WEEKDAYS" :key="d" class="small muted" style="text-align: center">{{ d }}</span>
            <template v-for="r in heat.rows" :key="r.label">
              <span class="small muted">{{ r.label }}</span>
              <span v-for="c in r.cells" :key="c.key" class="heat-cell" :style="c.style" :title="c.title" />
            </template>
          </div>
          <span class="small muted">{{ heat.summary }}</span>
        </div>
      </div>
    </section>

    <GrowthPanel :accounts="shownAccounts" :days="days" :followers="followers" />
  </div>
</template>
