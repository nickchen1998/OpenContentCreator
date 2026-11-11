<script setup lang="ts">
// 串文管理：Threads 發得多，大部分不屬於任何系列文。左邊看每則貼文的成效，右邊看回覆、手動回一句，或把貼文放進系列文
type ThreadPost = InsightPost & { seriesId: number | null, received: number, pending: number, parts: number }
const { accounts } = useLookup()
const posts = ref<ThreadPost[]>([])
const series = ref<{ id: number, name: string }[]>([])
const loaded = ref(false)
const syncing = ref(false)
const filter = ref<'all' | 'pending' | 'loose'>('all')
const selectedId = ref(0)
const replies = ref<CommentRow[]>([])

const threadAccounts = computed(() => accounts.value.filter(a => a.platform === 'threads'))
const accountName = (id: number) => threadAccounts.value.find(a => a.id === id)?.name ?? ''
const seriesName = (id: number | null) => series.value.find(s => s.id === id)?.name ?? ''
const dayOf = (iso: string) => fmtAt(minutesToAt(Math.floor(Date.parse(iso) / 60000) + 480)).replace(/（.）/, ' ')
const rate = (eng: number, views: number) => (views ? `${(eng / views * 100).toFixed(1)}%` : '—')

const recent = computed(() => {
  const since = Date.now() - 28 * 86400_000
  return totalsOf(posts.value.filter(p => Date.parse(p.publishedAt) >= since))
})
const pendingTotal = computed(() => posts.value.reduce((n, p) => n + p.pending, 0))

const filtered = computed(() => posts.value.filter(p => filter.value === 'all' || (filter.value === 'pending' ? p.pending > 0 : p.seriesId == null)))
const PAGE_SIZE = 8
const page = ref(1)
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const shown = computed(() => filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
const listEl = ref<HTMLElement>()
function goPage(n: number) {
  page.value = Math.min(Math.max(1, n), pages.value)
  listEl.value?.scrollTo({ top: 0 })
}
watch(filter, () => goPage(1))

const selected = computed(() => posts.value.find(p => p.id === selectedId.value))

async function load() {
  const data = await attempt(() => api<{ posts: ThreadPost[], series: { id: number, name: string }[] }>('/api/threads'))
  if (data) {
    posts.value = data.posts
    series.value = data.series
    if (!selected.value && data.posts.length) await pick((data.posts.find(p => p.pending > 0) ?? data.posts[0]!).id)
  }
  loaded.value = true
}
const fetching = ref(false)
const waitingOnly = ref(false)
async function pick(id: number) {
  selectedId.value = id
  // 先顯示已經記下的，再向 Threads 抓這一則最新的整串對話
  replies.value = await attempt(() => api<CommentRow[]>(`/api/threads/${id}`)) ?? []
  fetching.value = true
  const fresh = await attempt(() => api<{ rows: CommentRow[], warning: string }>(`/api/threads/${id}/refresh`, { method: 'POST' }))
  fetching.value = false
  if (!fresh || selectedId.value !== id) return
  replies.value = fresh.rows
  if (fresh.warning) notify(fresh.warning)
}
onMounted(load)
// 有新的回覆或狀態變動時自動更新（只讀已經記下的，不會每次都去打 Threads）
useAutoRefresh(() => refresh())

/** 右邊的對話有變動（回覆、不用回）：重新讀這則的對話，左邊的待回覆數字也跟著更新 */
async function refresh() {
  if (selectedId.value) replies.value = await attempt(() => api<CommentRow[]>(`/api/threads/${selectedId.value}`)) ?? replies.value
  await load()
}

async function sync() {
  syncing.value = true
  // 成效數字與對話分兩個請求（各自有對外請求的上限）：先同步貼文與數字，再抓最新幾則貼文的整串對話
  const data = await attempt(() => api<{ errors: string[] }>('/api/insights/sync', { method: 'POST' }))
  const talk = await attempt(() => api<{ errors: string[] }>('/api/threads/refresh', { method: 'POST' }))
  syncing.value = false
  const errors = [...(data?.errors ?? []), ...(talk?.errors ?? [])]
  if (data || talk) notify(errors.length ? errors.join('；') : '已同步')
  await load()
  if (selectedId.value) await pick(selectedId.value)
}
async function setSeries(value: string) {
  const post = selected.value
  if (!post) return
  const seriesId = value ? Number(value) : null
  if (await attempt(() => api(`/api/threads/${post.id}/series`, { method: 'PUT', body: { seriesId } }), '已儲存')) post.seriesId = seriesId
}
</script>

<template>
  <div class="row between">
    <div class="row" role="group" aria-label="篩選貼文">
      <button type="button" class="chip" :aria-pressed="filter === 'all'" @click="filter = 'all'">全部</button>
      <button type="button" class="chip" :aria-pressed="filter === 'pending'" @click="filter = 'pending'">有待回覆的對話</button>
      <button type="button" class="chip" :aria-pressed="filter === 'loose'" @click="filter = 'loose'">未歸入系列文</button>
    </div>
    <button type="button" class="btn" :disabled="syncing || !threadAccounts.length" @click="sync">{{ syncing ? '同步中…' : '立即同步' }}</button>
  </div>

  <div class="stats">
    <div class="stat"><span class="small muted">近 28 天貼文</span><b>{{ fmtNum(recent.posts) }} 則</b></div>
    <div class="stat"><span class="small muted">觀看</span><b>{{ fmtNum(recent.views) }}</b></div>
    <div class="stat"><span class="small muted">互動率</span><b>{{ rate(recent.engagement, recent.views) }}</b></div>
    <div class="stat"><span class="small muted">待回覆的對話</span><b>{{ fmtNum(pendingTotal) }} 串</b></div>
  </div>

  <div v-if="loaded && !posts.length" class="card empty">
    還沒有 Threads 貼文　<NuxtLink to="/accounts">連結帳號</NuxtLink>
  </div>
  <div v-else class="fit-grid cols-2 fill">
    <section class="card" aria-label="貼文">
      <div class="row between">
        <h2>貼文</h2>
        <span class="small muted">{{ filtered.length }} 則</span>
      </div>
      <div ref="listEl" class="thread-list fill scroll">
        <button v-for="p in shown" :key="p.id" type="button" class="thread-item" :aria-pressed="p.id === selectedId" @click="pick(p.id)">
          <span class="row between" style="gap: 10px; flex-wrap: nowrap; align-items: flex-start">
            <span class="thread-text">{{ p.text || '（沒有文字的貼文）' }}</span>
            <span v-if="p.pending" class="tag" style="flex: none; background: var(--warn-bg); color: var(--warn)">{{ p.pending }} 串待回覆</span>
          </span>
          <span class="row small muted" style="gap: 2px 14px">
            <span v-if="threadAccounts.length > 1">{{ accountName(p.accountId) }}</span>
            <span>{{ dayOf(p.publishedAt) }}</span>
            <span>觀看 {{ fmtNum(p.views) }}</span>
            <span>讚 {{ fmtNum(p.likes) }}</span>
            <span>回覆 {{ fmtNum(p.comments) }}</span>
            <span v-if="p.parts">子文 {{ p.parts }} 則</span>
            <span v-if="p.seriesId" class="bold" style="color: var(--green-deep)">{{ seriesName(p.seriesId) }}</span>
          </span>
        </button>
        <div v-if="!shown.length" class="empty">沒有貼文</div>
      </div>
      <div v-if="pages > 1" class="row between" role="navigation" aria-label="貼文分頁">
        <button type="button" class="btn sm" :disabled="page <= 1" @click="goPage(page - 1)">上一頁</button>
        <span class="small muted" aria-live="polite">第 {{ page }} / {{ pages }} 頁</span>
        <button type="button" class="btn sm" :disabled="page >= pages" @click="goPage(page + 1)">下一頁</button>
      </div>
    </section>

    <section v-if="selected" class="card" aria-label="這則貼文的回覆">
      <div class="col shrink" style="gap: 6px">
        <p class="bold wrap-any thread-full">{{ selected.text || '（沒有文字的貼文）' }}</p>
        <div class="row small muted" style="gap: 2px 16px">
          <span>{{ dayOf(selected.publishedAt) }}</span>
          <span>觀看 {{ fmtNum(selected.views) }}</span>
          <span>讚 {{ fmtNum(selected.likes) }}</span>
          <span>回覆 {{ fmtNum(selected.comments) }}</span>
          <span>轉發 {{ fmtNum(selected.shares) }}</span>
          <a v-if="selected.url" :href="selected.url" target="_blank" rel="noopener noreferrer">在 Threads 開啟</a>
          <span v-if="fetching" aria-live="polite">更新中…</span>
        </div>
      </div>
      <div class="thread-series">
        <label for="thread-series-pick" class="small bold">系列文</label>
        <select id="thread-series-pick" :value="selected.seriesId ?? ''" @change="setSeries(($event.target as HTMLSelectElement).value)">
          <option value="">不加入</option>
          <option v-for="s in series" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      <button type="button" class="chip" :aria-pressed="waitingOnly" @click="waitingOnly = !waitingOnly">只看待回覆</button>
      </div>

      <ConversationList :rows="replies" show-parts :waiting-only="waitingOnly" @changed="refresh" />
    </section>
  </div>
</template>
