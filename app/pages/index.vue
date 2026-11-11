<script setup lang="ts">
// 儀表板：最上面一行是待回覆的對話＋這段期間的成效（跟前一段期間比）、哪些貼文表現好、各系列文與各帳號
const boot = useBoot()
const days = ref(28)
const allPosts = ref<InsightPost[]>([]) // 兩倍期間的貼文：後半是這個期間，前半拿來比較
interface Status { accountId: number, lastSyncedAt: string | null, lastError: string, tokenExpiresAt: string | null }
const status = ref<Status[]>([])
const replies = ref({ replied: 0, dms: 0, dmTried: 0 })
const todo = ref({ waiting: 0, oldestWaitAt: null as string | null, failed: 0, failedIn: '', failedSeriesId: null as number | null, bySeries: {} as Record<number, number> })
const series = ref<Series[]>([])
const syncing = ref(false)
const loaded = ref(false)
const { account } = useLookup()

async function load() {
  const [data, list] = await Promise.all([
    attempt(() => api<{ posts: InsightPost[], status: Status[], replies: typeof replies.value, todo: typeof todo.value }>('/api/insights', { query: { days: days.value } })),
    attempt(() => api<Series[]>('/api/series')),
  ])
  if (data) {
    allPosts.value = data.posts
    status.value = data.status
    replies.value = data.replies
    todo.value = data.todo
  }
  series.value = list ?? []
  loaded.value = true
}
watch(days, load, { immediate: true })
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

// ---- 今天要處理 ----
const waitedFor = computed(() => {
  if (!todo.value.oldestWaitAt) return ''
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(todo.value.oldestWaitAt)) / 60000))
  return minutes < 60 ? `${minutes} 分鐘` : minutes < 1440 ? `${Math.floor(minutes / 60)} 小時` : `${Math.floor(minutes / 1440)} 天`
})
const linkErrors = computed(() => status.value.filter(s => s.lastError))

// ---- 這個期間 vs 前一個期間（各自是「那段期間發的貼文」的累計數字）----
const since = computed(() => new Date(Date.now() - days.value * 86400_000).toISOString())
const posts = computed(() => allPosts.value.filter(p => p.publishedAt >= since.value))
const before = computed(() => allPosts.value.filter(p => p.publishedAt < since.value))
const summary = computed(() => summarizeInsights(posts.value, boot.value))
const kpis = computed(() => {
  const now = totalsOf(posts.value)
  const prev = totalsOf(before.value)
  const sum = (list: InsightPost[]) => list.reduce((a, p) => a + p.comments, 0)
  const trend = (diff: number, text: string) => ({ text: `${diff > 0 ? '▲' : diff < 0 ? '▼' : '—'} ${text}`, dir: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat' })
  const none = { text: `前 ${days.value} 天沒有貼文`, dir: 'flat' }
  const viewsDiff = now.views - prev.views
  const rateDiff = (now.views ? now.engagement / now.views : 0) - (prev.views ? prev.engagement / prev.views : 0)
  const commentsDiff = sum(posts.value) - sum(before.value)
  return [
    { label: '觀看', value: fmtNum(now.views), delta: prev.views ? trend(viewsDiff, `${Math.abs(Math.round(viewsDiff / prev.views * 100))}%　比前 ${days.value} 天`) : none },
    { label: '互動率', value: rate(now.engagement, now.views), delta: prev.views && now.views ? trend(rateDiff, `${Math.abs(rateDiff * 100).toFixed(1)} 個百分點`) : none },
    { label: '留言', value: `${fmtNum(sum(posts.value))} 則`, delta: prev.posts ? trend(commentsDiff, `${fmtNum(Math.abs(commentsDiff))} 則`) : none },
    { label: '私訊送出', value: `${fmtNum(replies.value.dms)} 則`, delta: { text: replies.value.dmTried ? `送達率 ${Math.round(replies.value.dms / replies.value.dmTried * 100)}%` : '　', dir: 'flat' } },
  ]
})

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
    return { ...p, platform: account(p.accountId)?.platform, day: fmtDay(taipei(p.publishedAt).slice(0, 10)), times: times >= 1.2 ? times.toFixed(1) : '', seriesName: series.value.find(s => s.id === p.seriesId)?.name ?? '' }
  })
})

// ---- 互動最好的發文時段：星期 × 早午晚，格子顏色是那個時段發的貼文的平均互動率 ----
const SLOTS = [{ label: '早', from: 5, to: 12 }, { label: '午', from: 12, to: 18 }, { label: '晚', from: 18, to: 29 }]
const SHADES = ['#dfe7da', '#b9c9b1', '#7f9a78', '#3e5346']
const heat = computed(() => {
  const cells = new Map<string, { eng: number, views: number, n: number }>()
  for (const p of allPosts.value) {
    if (!p.views) continue
    const at = taipei(p.publishedAt)
    const hour = Number(at.slice(11, 13))
    const slot = SLOTS.findIndex(s => (hour < 5 ? hour + 24 : hour) >= s.from && (hour < 5 ? hour + 24 : hour) < s.to)
    // 凌晨發的算前一天晚上
    const day = (weekdayIdx(at.slice(0, 10)) + (hour < 5 ? 6 : 0)) % 7
    const cell = cells.get(`${slot}:${day}`) ?? { eng: 0, views: 0, n: 0 }
    cells.set(`${slot}:${day}`, { eng: cell.eng + engagementOf(p), views: cell.views + p.views, n: cell.n + 1 })
  }
  const rates = [...cells.values()].map(c => c.eng / c.views).sort((a, b) => a - b)
  const level = (r: number) => Math.min(SHADES.length - 1, Math.floor(rates.filter(x => x < r).length / rates.length * SHADES.length))
  let best = { label: '', rate: 0 }
  const rows = SLOTS.map((s, si) => ({
    label: s.label,
    cells: WEEKDAYS.map((d, di) => {
      const c = cells.get(`${si}:${di}`)
      if (!c) return { key: `${si}:${di}`, style: 'background: var(--green-faint)', title: `週${d}${s.label}：沒有貼文` }
      const r = c.eng / c.views
      if (r > best.rate) best = { label: `週${d}${s.label}`, rate: r }
      return { key: `${si}:${di}`, style: `background: ${SHADES[level(r)]}`, title: `週${d}${s.label}：${c.n} 則，互動率 ${(r * 100).toFixed(1)}%` }
    }),
  }))
  // 貼文太少時格子大多是空的，看了會誤導，不顯示
  const count = [...cells.values()].reduce((a, c) => a + c.n, 0)
  return { rows, show: count >= 8, summary: best.label ? `各時段的平均互動率，${best.label}最高（${(best.rate * 100).toFixed(1)}%）` : '' }
})

// ---- 系列文 ----
const rows = computed(() => series.value.map((s) => {
  const totals = totalsOf(s.posts)
  return {
    ...s, totals, platforms: [...new Set(s.posts.map(p => account(p.accountId)?.platform).filter(Boolean))] as Platform[],
    commentRate: totals.views ? `${(s.received / totals.views * 100).toFixed(1)}%` : '—',
    delivered: !s.dmText ? '未設定' : `${fmtNum(s.dms)}／${fmtNum(s.matched)}`,
    waiting: todo.value.bySeries[s.id] ?? 0,
  }
}))
const perWeek = (n: number) => (n / (days.value / 7)).toFixed(n / (days.value / 7) < 10 ? 1 : 0)
</script>

<template>
  <div class="row between">
    <div class="row" role="group" aria-label="期間">
      <button type="button" class="chip" :aria-pressed="days === 7" @click="days = 7">近 7 天</button>
      <button type="button" class="chip" :aria-pressed="days === 28" @click="days = 28">近 28 天</button>
      <button type="button" class="chip" :aria-pressed="days === 90" @click="days = 90">近 90 天</button>
    </div>
    <div class="row">
      <NuxtLink v-if="todo.failed" :to="todo.failedSeriesId ? `/series/${todo.failedSeriesId}` : '/feed'" class="alert-chip">{{ todo.failed }} 則送出失敗</NuxtLink>
      <NuxtLink v-if="linkErrors.length" to="/accounts" class="alert-chip" :title="linkErrors[0]?.lastError">{{ linkErrors.length }} 個連結異常</NuxtLink>
      <span v-if="lastSynced" class="small muted">更新於 {{ lastSynced }}</span>
      <button type="button" class="btn" :disabled="syncing || !connected" @click="sync">{{ syncing ? '同步中…' : '立即同步' }}</button>
    </div>
  </div>

  <div v-if="loaded && !connected" class="card empty">
    還沒有連結帳號　<NuxtLink to="/accounts">前往連結</NuxtLink>
  </div>

  <!-- 一行五格：第一格是要動手的事，後面四格是這段期間的成效。送出失敗、連結異常平常不占位置，有狀況才出現在上面那一列 -->
  <div class="stats">
    <NuxtLink to="/feed?filter=pending" class="stat stat-link" :class="{ warn: todo.waiting }">
      <span class="small muted">待回覆的對話</span><b>{{ fmtNum(todo.waiting) }} 串</b>
      <span class="small muted">{{ waitedFor ? `最久的等了 ${waitedFor}` : '都回完了' }}</span>
    </NuxtLink>
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

    <div class="fit-col">
      <section class="card fill">
        <div class="row between">
          <h2>系列文</h2>
          <NuxtLink to="/series" class="btn sm">管理系列文</NuxtLink>
        </div>
        <div class="table-scroll fill scroll">
          <table class="compact">
            <thead>
              <tr><th scope="col">系列文</th><th scope="col">觀看</th><th scope="col">留言率</th><th scope="col">私訊送達</th><th scope="col">待回覆</th></tr>
            </thead>
            <tbody>
              <tr v-for="s in rows" :key="s.id">
                <th scope="row">
                  <NuxtLink :to="`/series/${s.id}`" style="color: var(--ink)">{{ s.name }}</NuxtLink>
                  <div class="small muted pf-row" style="font-weight: 400; display: flex; margin-top: 2px"><PlatformIcon v-for="p in s.platforms" :key="p" :platform="p" :size="14" /><template v-if="!s.platforms.length">還沒有貼文</template></div>
                </th>
                <td>{{ fmtNum(s.totals.views) }}</td>
                <td>{{ s.commentRate }}</td>
                <td>{{ s.delivered }}</td>
                <td><span v-if="s.waiting" class="tag" style="background: var(--warn-bg); color: var(--warn)">{{ s.waiting }} 串</span><template v-else>0</template></td>
              </tr>
            </tbody>
          </table>
          <div v-if="loaded && !rows.length" class="empty">還沒有系列文</div>
        </div>
      </section>

      <section class="card fill">
        <h2>各帳號</h2>
        <div class="table-scroll fill scroll">
          <table class="compact">
            <thead>
              <tr><th scope="col">帳號</th><th scope="col">發文</th><th scope="col">觀看</th><th scope="col">互動率</th></tr>
            </thead>
            <tbody>
              <tr v-for="r in summary.rows" :key="r.accountId">
                <th scope="row"><PlatformIcon :platform="r.platform" label /><div class="small muted" style="font-weight: 400">{{ r.name }}</div></th>
                <td>{{ r.posts }}<div class="small muted">每週 {{ perWeek(r.posts) }} 則</div></td>
                <td>{{ fmtNum(r.views) }}</td>
                <td>{{ rate(r.engagement, r.views) }}</td>
              </tr>
            </tbody>
          </table>
          <div v-if="!summary.rows.length" class="empty">還沒有帳號</div>
        </div>
      </section>
    </div>
  </div>
</template>
