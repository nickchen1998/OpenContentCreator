<script setup lang="ts">
// 儀表板：整體數字、各系列文、各帳號。逐則貼文的成效在各系列文裡看
const boot = useBoot()
const days = ref(28)
const posts = ref<InsightPost[]>([])
const status = ref<{ accountId: number, lastSyncedAt: string | null, lastError: string }[]>([])
const replies = ref({ replied: 0, dms: 0 })
const series = ref<Series[]>([])
const syncing = ref(false)
const loaded = ref(false)
const { accountLabel, account } = useLookup()

async function load() {
  const [data, list] = await Promise.all([
    attempt(() => api<{ posts: InsightPost[], status: typeof status.value, replies: typeof replies.value }>('/api/insights', { query: { days: days.value } })),
    attempt(() => api<Series[]>('/api/series')),
  ])
  if (data) {
    posts.value = data.posts
    status.value = data.status
    replies.value = data.replies
  }
  series.value = list ?? []
  loaded.value = true
}
watch(days, load, { immediate: true })

async function sync() {
  syncing.value = true
  const data = await attempt(() => api<{ errors: string[] }>('/api/insights/sync', { method: 'POST' }))
  syncing.value = false
  if (!data) return
  notify(data.errors[0] ?? '已更新')
  await load()
}

const summary = computed(() => summarizeInsights(posts.value, boot.value))
const connected = computed(() => status.value.length > 0)
const errors = computed(() => status.value.filter(s => s.lastError))
const lastSynced = computed(() => {
  const latest = status.value.map(s => s.lastSyncedAt).filter(Boolean).sort().at(-1)
  return latest ? minutesToAt(Math.floor(Date.parse(latest) / 60000) + 480).replace('T', ' ').slice(5) : ''
})
const rate = (eng: number, views: number) => (views ? `${(eng / views * 100).toFixed(1)}%` : '—')
// 系列文的數字是裡面所有貼文的累計；最下面一列是這段期間沒有歸入任何系列文的貼文
const rows = computed(() => series.value.map(s => ({ ...s, totals: totalsOf(s.posts), platforms: [...new Set(s.posts.map(p => account(p.accountId)?.platform).filter(Boolean))] as Platform[] })))
const maxViews = computed(() => Math.max(1, ...rows.value.map(r => r.totals.views)))
const bar = (views: number) => ({ width: `${Math.max(views ? 2 : 0, Math.round(views / maxViews.value * 100))}%` })
</script>

<template>
  <div class="row between">
    <div class="row" role="group" aria-label="期間">
      <button type="button" class="chip" :aria-pressed="days === 7" @click="days = 7">近 7 天</button>
      <button type="button" class="chip" :aria-pressed="days === 28" @click="days = 28">近 28 天</button>
      <button type="button" class="chip" :aria-pressed="days === 90" @click="days = 90">近 90 天</button>
    </div>
    <div class="row">
      <span v-if="lastSynced" class="small muted">更新於 {{ lastSynced }}</span>
      <button type="button" class="btn" :disabled="syncing || !connected" @click="sync">{{ syncing ? '同步中…' : '立即同步' }}</button>
    </div>
  </div>

  <div v-if="loaded && !connected" class="card empty">
    還沒有連結帳號　<NuxtLink to="/accounts">前往連結</NuxtLink>
  </div>
  <div v-for="e in errors" :key="e.accountId" class="card" style="background: var(--danger-bg); border-color: var(--danger)" role="alert">
    <span class="small pf-row"><PlatformIcon :platform="account(e.accountId)?.platform" /><b>{{ accountLabel(e.accountId) }}</b>{{ e.lastError }}</span>
  </div>

  <div class="stats">
    <div class="stat"><span class="small muted">總觀看</span><b>{{ fmtNum(summary.totals.views) }}</b></div>
    <div class="stat"><span class="small muted">總互動</span><b>{{ fmtNum(summary.totals.engagement) }}</b></div>
    <div class="stat"><span class="small muted">平均互動率</span><b>{{ rate(summary.totals.engagement, summary.totals.views) }}</b></div>
    <div class="stat"><span class="small muted">自動回覆</span><b>{{ fmtNum(replies.replied) }} 則</b></div>
    <div class="stat"><span class="small muted">私訊送出</span><b>{{ fmtNum(replies.dms) }} 則</b></div>
  </div>

  <div class="fit-grid cols-3-2 fill">
  <section class="card">
    <div class="row between">
      <h2>系列文</h2>
      <NuxtLink to="/series" class="btn">管理系列文</NuxtLink>
    </div>
    <div class="table-scroll fill scroll">
      <table class="compact" style="min-width: 520px">
        <thead>
          <tr><th scope="col">系列文</th><th scope="col">貼文</th><th scope="col">觀看</th><th scope="col">觀看占比</th><th scope="col">互動率</th><th scope="col">留言</th><th scope="col">私訊送出</th></tr>
        </thead>
        <tbody>
          <tr v-for="s in rows" :key="s.id">
            <th scope="row">
              <NuxtLink :to="`/series/${s.id}`" style="color: var(--ink)">{{ s.name }}</NuxtLink>
              <div class="small muted pf-row" style="font-weight: 400; display: flex; margin-top: 2px"><PlatformIcon v-for="p in s.platforms" :key="p" :platform="p" :size="14" /><template v-if="!s.platforms.length">還沒有貼文</template></div>
            </th>
            <td>{{ s.posts.length }} 則</td>
            <td>{{ fmtNum(s.totals.views) }}</td>
            <td><div class="bar-track" aria-hidden="true"><div class="bar" :style="bar(s.totals.views)" /></div></td>
            <td>{{ rate(s.totals.engagement, s.totals.views) }}</td>
            <td>{{ fmtNum(s.received) }}</td>
            <td>{{ s.dmText ? `${fmtNum(s.dms)} 則` : '未設定' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <section class="card">
    <h2>各帳號</h2>
    <div class="table-scroll fill scroll">
      <table class="compact">
        <thead>
          <tr><th scope="col">帳號</th><th scope="col">發文</th><th scope="col">觀看</th><th scope="col">互動</th><th scope="col">互動率</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in summary.rows" :key="r.accountId">
            <th scope="row"><PlatformIcon :platform="r.platform" label /><div class="small muted" style="font-weight: 400">{{ r.name }}</div></th>
            <td>{{ r.posts }}</td>
            <td>{{ fmtNum(r.views) }}</td>
            <td>{{ fmtNum(r.engagement) }}</td>
            <td>{{ rate(r.engagement, r.views) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="!summary.rows.length" class="empty">還沒有帳號</div>
  </section>
  </div>
</template>
