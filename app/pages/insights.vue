<script setup lang="ts">
const boot = useBoot()
const { accountLabel, group } = useLookup()
const days = ref(28)
const posts = ref<InsightPost[]>([])
const status = ref<{ accountId: number, lastSyncedAt: string | null, lastError: string }[]>([])
const syncing = ref(false)
const loaded = ref(false)

async function load() {
  const data = await attempt(() => api<{ posts: InsightPost[], status: typeof status.value }>('/api/insights', { query: { days: days.value } }))
  if (data) {
    posts.value = data.posts
    status.value = data.status
  }
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
  const times = status.value.map(s => s.lastSyncedAt).filter(Boolean).sort()
  const latest = times.at(-1)
  return latest ? minutesToAt(Math.floor(Date.parse(latest) / 60000) + 480).replace('T', ' ').slice(5) : ''
})
const rate = (eng: number, views: number) => (views ? `${(eng / views * 100).toFixed(1)}%` : '—')
const maxViews = computed(() => Math.max(1, ...summary.value.rows.map(r => r.views)))
const maxGroupViews = computed(() => Math.max(1, ...summary.value.groups.map(g => g.views)))
const share = (views: number) => (summary.value.totals.views ? `${Math.round(views / summary.value.totals.views * 100)}%` : '0%')
const GROUP_COLORS = ['#3E5346', '#7A7A33', '#66796A', '#4B2FA3', '#8A1F52']
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
    還沒有連結帳號　<NuxtLink to="/groups">前往連結</NuxtLink>
  </div>
  <div v-for="e in errors" :key="e.accountId" class="card" style="background: var(--danger-bg); border-color: var(--danger)" role="alert">
    <span class="small"><b>{{ accountLabel(e.accountId) }}</b>　{{ e.lastError }}</span>
  </div>

  <div class="stats">
    <div class="stat"><span class="small muted">總觀看</span><b>{{ fmtNum(summary.totals.views) }}</b></div>
    <div class="stat"><span class="small muted">總互動</span><b>{{ fmtNum(summary.totals.engagement) }}</b></div>
    <div class="stat"><span class="small muted">平均互動率</span><b>{{ rate(summary.totals.engagement, summary.totals.views) }}</b></div>
    <div class="stat"><span class="small muted">收藏</span><b>{{ fmtNum(summary.totals.saves) }}</b></div>
    <div class="stat"><span class="small muted">發文數</span><b>{{ summary.totals.posts }} 則</b></div>
  </div>

  <section class="card">
    <h2>各帳號比較</h2>
    <div class="table-scroll">
      <table style="min-width: 720px">
        <thead>
          <tr><th scope="col">群組 · 帳號</th><th scope="col">發文</th><th scope="col">觀看</th><th scope="col">觀看占比</th><th scope="col">互動</th><th scope="col">互動率</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in summary.rows" :key="r.accountId">
            <th scope="row">{{ r.groupName }} · {{ PLATFORMS[r.platform].label }}<div class="small muted" style="font-weight: 400">{{ r.name }}</div></th>
            <td>{{ r.posts }}</td>
            <td>{{ fmtNum(r.views) }}</td>
            <td><div class="bar-track" aria-hidden="true"><div class="bar" :style="{ width: `${Math.round(r.views / maxViews * 100)}%` }" /></div></td>
            <td>{{ fmtNum(r.engagement) }}</td>
            <td>{{ rate(r.engagement, r.views) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="!summary.rows.length" class="empty">還沒有帳號</div>
  </section>

  <div class="grid-2">
    <section class="card">
      <h2>表現最好的貼文</h2>
      <div class="col divided" style="gap: 14px">
        <div v-for="t in summary.top" :key="t.id" class="row between" style="flex-wrap: nowrap; gap: 12px">
          <div class="col grow">
            <a :href="t.url" target="_blank" rel="noopener noreferrer" class="bold" style="color: var(--ink)">{{ t.text || '（沒有文字的貼文）' }}</a>
            <div class="small muted">{{ accountLabel(t.accountId) }} · {{ fmtDay(minutesToAt(Math.floor(Date.parse(t.publishedAt) / 60000) + 480).slice(0, 10)) }}</div>
          </div>
          <div class="col" style="text-align: right; white-space: nowrap">
            <div class="bold">{{ fmtNum(t.views) }} 觀看</div>
            <div class="small muted">{{ fmtNum(engagementOf(t)) }} 互動</div>
          </div>
        </div>
      </div>
      <div v-if="!summary.top.length" class="empty">這段期間沒有貼文</div>
    </section>
    <section class="card">
      <h2>各群組的觀看</h2>
      <div v-for="(g, i) in summary.groups" :key="g.groupId" class="col" style="gap: 6px">
        <div class="row between"><span class="bold">{{ group(g.groupId)?.name }}</span><span>{{ fmtNum(g.views) }}（{{ share(g.views) }}）</span></div>
        <div class="bar-track" aria-hidden="true"><div class="bar" :style="{ width: `${Math.round(g.views / maxGroupViews * 100)}%`, background: GROUP_COLORS[i % GROUP_COLORS.length] }" /></div>
      </div>
    </section>
  </div>
</template>
