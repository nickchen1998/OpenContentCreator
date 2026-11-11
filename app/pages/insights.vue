<script setup lang="ts">
const boot = useBoot()
const { accountLabel } = useLookup()
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

// 系列：自己挑的一組貼文，合併看成效
const collections = ref<Collection[]>([])
const openId = ref(0)
const selected = ref<number[]>([])
const target = ref<number | 'new'>('new')
const newName = ref('')
async function loadCollections() {
  collections.value = await attempt(() => api<Collection[]>('/api/collections')) ?? []
  if (target.value !== 'new' && !collections.value.some(c => c.id === target.value)) target.value = 'new'
}
onMounted(loadCollections)
async function addSelected() {
  const ok = target.value === 'new'
    ? await attempt(() => api('/api/collections', { method: 'POST', body: { name: newName.value, postIds: selected.value } }), '已建立系列')
    : await attempt(() => api(`/api/collections/${target.value}`, { method: 'PATCH', body: { addPostIds: selected.value } }), '已加入')
  if (!ok) return
  selected.value = []
  newName.value = ''
  await loadCollections()
}
async function removeFrom(c: Collection, postId: number) {
  if (await attempt(() => api(`/api/collections/${c.id}`, { method: 'PATCH', body: { removePostIds: [postId] } }))) await loadCollections()
}
async function rename(c: Collection) {
  const name = prompt('系列名稱', c.name)?.trim()
  if (!name || name === c.name) return
  if (await attempt(() => api(`/api/collections/${c.id}`, { method: 'PATCH', body: { name } }))) await loadCollections()
}
async function removeCollection(c: Collection) {
  if (!confirm(`刪除系列「${c.name}」？貼文本身不會被刪除。`)) return
  if (await attempt(() => api(`/api/collections/${c.id}`, { method: 'DELETE' }))) await loadCollections()
}
const sorted = computed(() => [...posts.value].sort((a, b) => b.views - a.views || engagementOf(b) - engagementOf(a)))
const dayOf = (iso: string) => fmtDay(minutesToAt(Math.floor(Date.parse(iso) / 60000) + 480).slice(0, 10))
const seriesOf = (postId: number) => collections.value.filter(c => c.posts.some(p => p.id === postId)).map(c => c.name)

async function sync() {
  syncing.value = true
  const data = await attempt(() => api<{ errors: string[] }>('/api/insights/sync', { method: 'POST' }))
  syncing.value = false
  if (!data) return
  notify(data.errors[0] ?? '已更新')
  await Promise.all([load(), loadCollections()])
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
          <tr><th scope="col">帳號</th><th scope="col">發文</th><th scope="col">觀看</th><th scope="col">觀看占比</th><th scope="col">互動</th><th scope="col">互動率</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in summary.rows" :key="r.accountId">
            <th scope="row">{{ PLATFORMS[r.platform].label }}<div class="small muted" style="font-weight: 400">{{ r.name }}</div></th>
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

  <section v-if="collections.length" class="card">
    <h2>系列</h2>
    <div class="col divided" style="gap: 12px">
      <div v-for="c in collections" :key="c.id" class="col" style="gap: 10px">
        <div class="row between" style="gap: 12px">
          <button type="button" class="row grow" style="background: none; border: 0; padding: 0; text-align: left; color: var(--ink); gap: 10px" :aria-expanded="openId === c.id" @click="openId = openId === c.id ? 0 : c.id">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" :style="{ transform: openId === c.id ? 'rotate(90deg)' : '', transition: 'transform .15s' }"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
            <span class="bold">{{ c.name }}</span>
            <span class="small muted">{{ c.posts.length }} 則</span>
          </button>
          <div class="row" style="gap: 20px; white-space: nowrap">
            <span><b>{{ fmtNum(totalsOf(c.posts).views) }}</b> <span class="small muted">觀看</span></span>
            <span><b>{{ fmtNum(totalsOf(c.posts).engagement) }}</b> <span class="small muted">互動</span></span>
            <span><b>{{ rate(totalsOf(c.posts).engagement, totalsOf(c.posts).views) }}</b> <span class="small muted">互動率</span></span>
          </div>
        </div>
        <div v-if="openId === c.id" class="col" style="gap: 8px; padding-left: 22px">
          <div v-for="p in c.posts" :key="p.id" class="row between" style="flex-wrap: nowrap; gap: 12px">
            <div class="col grow">
              <a :href="p.url" target="_blank" rel="noopener noreferrer" style="color: var(--ink)">{{ p.text || '（沒有文字的貼文）' }}</a>
              <span class="small muted">{{ accountLabel(p.accountId) }} · {{ dayOf(p.publishedAt) }}</span>
            </div>
            <span class="small" style="white-space: nowrap">{{ fmtNum(p.views) }} 觀看 · {{ fmtNum(engagementOf(p)) }} 互動</span>
            <button type="button" class="btn sm" :aria-label="`把「${p.text}」移出 ${c.name}`" @click="removeFrom(c, p.id)">移出</button>
          </div>
          <div v-if="!c.posts.length" class="small muted">還沒有貼文</div>
          <div class="row">
            <button type="button" class="btn sm" @click="rename(c)">改名</button>
            <button type="button" class="btn sm danger" @click="removeCollection(c)">刪除系列</button>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="card">
    <div class="row between">
      <h2>貼文</h2>
      <form v-if="selected.length" class="row" @submit.prevent="addSelected">
        <span class="small muted">已選 {{ selected.length }} 則</span>
        <select v-model="target" aria-label="加入哪個系列" style="width: auto; min-height: 40px; padding: 6px 12px; font-size: 13px">
          <option value="new">新系列</option>
          <option v-for="c in collections" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <input v-if="target === 'new'" v-model="newName" type="text" maxlength="40" required placeholder="系列名稱" aria-label="系列名稱" style="width: 160px; min-height: 40px; padding: 6px 12px; font-size: 13px">
        <button type="submit" class="btn primary">加入系列</button>
      </form>
    </div>
    <div class="table-scroll">
      <table v-if="sorted.length" style="min-width: 720px">
        <thead>
          <tr><th scope="col"><span class="small">選取</span></th><th scope="col">貼文</th><th scope="col">帳號</th><th scope="col">日期</th><th scope="col">觀看</th><th scope="col">互動</th><th scope="col">收藏</th></tr>
        </thead>
        <tbody>
          <tr v-for="p in sorted" :key="p.id">
            <td><input v-model="selected" type="checkbox" :value="p.id" :aria-label="`選取「${p.text}」`" style="width: 18px; height: 18px; accent-color: var(--green-deep)"></td>
            <th scope="row" style="font-weight: 400">
              <a :href="p.url" target="_blank" rel="noopener noreferrer" style="color: var(--ink)">{{ p.text || '（沒有文字的貼文）' }}</a>
              <span v-for="name in seriesOf(p.id)" :key="name" class="pill" style="margin-left: 6px">{{ name }}</span>
            </th>
            <td style="white-space: nowrap">{{ accountLabel(p.accountId) }}</td>
            <td style="white-space: nowrap">{{ dayOf(p.publishedAt) }}</td>
            <td>{{ fmtNum(p.views) }}</td>
            <td>{{ fmtNum(engagementOf(p)) }}</td>
            <td>{{ fmtNum(p.saves) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">這段期間沒有貼文</div>
    </div>
  </section>
</template>
