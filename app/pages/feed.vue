<script setup lang="ts">
// 貼文管理：各平台（Threads、Instagram、Facebook）已同步的貼文，不管有沒有放進系列文。左邊看每則貼文的成效，右邊看留言、手動回一句。
// 貼文歸在哪個系列文只在左邊的清單顯示，要改到系列文管理去改。Threads 的子文串只有 Threads 的貼文有
type FeedPost = InsightPost & { seriesId: number | null, received: number, pending: number, parts: number }
const { accounts, account } = useLookup()
const posts = ref<FeedPost[]>([])
const series = ref<{ id: number, name: string }[]>([])
const loaded = ref(false)
const route = useRoute()
// 從儀表板的「待回覆的對話」點進來會帶 ?filter=pending
const filter = ref<'all' | 'pending' | 'loose'>(route.query.filter === 'pending' ? 'pending' : 'all')
const selectedId = ref(0)
const replies = ref<CommentRow[]>([])

const platformOf = (p: { accountId: number }) => account(p.accountId)?.platform
// 平台分頁：只列出真的有貼文的平台
const platform = ref<Platform | 'all'>('all')
const platforms = computed(() => PLATFORM_KEYS.filter(k => posts.value.some(p => platformOf(p) === k)))
const inPlatform = computed(() => posts.value.filter(p => platform.value === 'all' || platformOf(p) === platform.value))
// 同一個平台連了不只一個帳號時，清單上才需要寫出帳號名稱
const showAccount = computed(() => new Set(accounts.value.filter(a => posts.value.some(p => p.accountId === a.id)).map(a => a.platform)).size
  < new Set(posts.value.map(p => p.accountId)).size)
// Threads 的用語跟其他平台不一樣
const words = (p: { accountId: number }) => (platformOf(p) === 'threads' ? { comments: '回覆', shares: '轉發' } : { comments: '留言', shares: '分享' })
const seriesName = (id: number | null) => series.value.find(s => s.id === id)?.name ?? ''
const dayOf = (iso: string) => fmtAt(minutesToAt(Math.floor(Date.parse(iso) / 60000) + 480)).replace(/（.）/, ' ')

const query = ref('')
const filtered = computed(() => {
  const matches = keywordMatcher(query.value)
  return inPlatform.value.filter(p => (filter.value === 'all' || (filter.value === 'pending' ? p.pending > 0 : p.seriesId == null)) && matches(p.text))
})
const PAGE_SIZE = 8
const page = ref(1)
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const shown = computed(() => filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
const listEl = ref<HTMLElement>()
function goPage(n: number) {
  page.value = Math.min(Math.max(1, n), pages.value)
  listEl.value?.scrollTo({ top: 0 })
}
watch([filter, platform, query], () => goPage(1))

const selected = computed(() => posts.value.find(p => p.id === selectedId.value))

async function load() {
  const data = await attempt(() => api<{ posts: FeedPost[], series: { id: number, name: string }[] }>('/api/feed'))
  if (data) {
    posts.value = data.posts
    series.value = data.series
    // 從儀表板點進來時可以指定要看哪一則（?post=）
    const wanted = Number(route.query.post)
    if (!selected.value && data.posts.length) await pick((data.posts.find(p => p.id === wanted) ?? data.posts.find(p => p.pending > 0) ?? data.posts[0]!).id)
  }
  loaded.value = true
}
const fetching = ref(false)
type Fresh = { rows: CommentRow[], warning: string, metrics: Pick<FeedPost, 'views' | 'likes' | 'comments' | 'shares' | 'saves'> | null }
/** 向平台抓這一則最新的留言（Threads 是整串對話）；metrics 為 true 時連成效數字一起（這則貼文的「立即同步」） */
async function fetchLatest(id: number, metrics: boolean) {
  fetching.value = true
  const fresh = await attempt(() => api<Fresh>(`/api/feed/${id}/refresh`, { method: 'POST', body: { metrics } }))
  fetching.value = false
  if (!fresh) return
  const post = posts.value.find(p => p.id === id)
  if (post && fresh.metrics) Object.assign(post, fresh.metrics)
  if (selectedId.value === id) replies.value = fresh.rows
  if (fresh.warning) notify(fresh.warning)
  else if (metrics) notify('已同步')
  if (metrics) await load()
}
async function pick(id: number) {
  selectedId.value = id
  // 先顯示已經記下的，再去抓最新的
  replies.value = await attempt(() => api<CommentRow[]>(`/api/feed/${id}`)) ?? []
  await fetchLatest(id, false)
}
onMounted(load)
// 有新的留言或狀態變動時自動更新（只讀已經記下的，不會每次都去打平台）
useAutoRefresh(() => refresh())

/** 右邊的對話有變動（回覆、不用回）：重新讀這則的對話，左邊的待回覆數字也跟著更新 */
async function refresh() {
  if (selectedId.value) replies.value = await attempt(() => api<CommentRow[]>(`/api/feed/${selectedId.value}`)) ?? replies.value
  await load()
}

</script>

<template>
  <div class="row between">
    <div v-if="platforms.length > 1" class="row" role="group" aria-label="平台">
      <button type="button" class="chip" :aria-pressed="platform === 'all'" @click="platform = 'all'">全部平台</button>
      <button v-for="k in platforms" :key="k" type="button" class="chip" :aria-pressed="platform === k" @click="platform = k"><PlatformIcon :platform="k" label /></button>
    </div>
    <div class="row" role="group" aria-label="篩選貼文">
      <button type="button" class="chip" :aria-pressed="filter === 'all'" @click="filter = 'all'">全部</button>
      <button type="button" class="chip" :aria-pressed="filter === 'pending'" @click="filter = 'pending'">有待回覆的對話</button>
      <button type="button" class="chip" :aria-pressed="filter === 'loose'" @click="filter = 'loose'">未歸入系列文</button>
    </div>
  </div>

  <div v-if="loaded && !posts.length" class="card empty">
    還沒有貼文　<a href="/accounts" @click.prevent="openSetup('accounts')">連結帳號</a>
  </div>
  <div v-else class="fit-grid cols-2 fill">
    <section class="card" aria-label="貼文">
      <div class="row between" style="flex-wrap: nowrap">
        <div class="row" style="gap: 10px; flex-wrap: nowrap; align-items: baseline">
          <h2>貼文</h2>
          <span class="small muted" style="white-space: nowrap">{{ filtered.length }} 則</span>
        </div>
        <input v-model="query" type="search" class="search" aria-label="搜尋貼文" placeholder="搜尋貼文">
      </div>
      <div ref="listEl" class="thread-list fill scroll">
        <button v-for="p in shown" :key="p.id" type="button" class="thread-item" :aria-pressed="p.id === selectedId" @click="pick(p.id)">
          <span class="row between" style="gap: 10px; flex-wrap: nowrap; align-items: flex-start">
            <span class="thread-text">{{ p.text || '（沒有文字的貼文）' }}</span>
            <span v-if="p.pending" class="tag" style="flex: none; background: var(--warn-bg); color: var(--warn)">{{ p.pending }} 串待回覆</span>
          </span>
          <span class="row small muted" style="gap: 2px 14px">
            <PlatformIcon :platform="platformOf(p)" :size="14" />
            <span v-if="showAccount">{{ account(p.accountId)?.name }}</span>
            <span>{{ dayOf(p.publishedAt) }}</span>
            <span>觀看 {{ fmtNum(p.views) }}</span>
            <span>讚 {{ fmtNum(p.likes) }}</span>
            <span>{{ words(p).comments }} {{ fmtNum(p.comments) }}</span>
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

    <section v-if="selected" class="card" aria-label="這則貼文的留言">
      <div class="col shrink" style="gap: 6px">
        <div class="row between" style="gap: 12px; flex-wrap: nowrap; align-items: flex-start">
          <p class="bold wrap-any thread-full">{{ selected.text || '（沒有文字的貼文）' }}</p>
          <button type="button" class="btn sm" style="flex: none" :disabled="fetching" @click="fetchLatest(selected.id, true)">{{ fetching ? '同步中…' : '立即同步' }}</button>
        </div>
        <div class="row small muted" style="gap: 2px 16px">
          <span>{{ dayOf(selected.publishedAt) }}</span>
          <span>觀看 {{ fmtNum(selected.views) }}</span>
          <span>讚 {{ fmtNum(selected.likes) }}</span>
          <span>{{ words(selected).comments }} {{ fmtNum(selected.comments) }}</span>
          <span>{{ words(selected).shares }} {{ fmtNum(selected.shares) }}</span>
          <span v-if="selected.saves">收藏 {{ fmtNum(selected.saves) }}</span>
          <a v-if="selected.url" :href="selected.url" target="_blank" rel="noopener noreferrer" class="pf-row" style="gap: 4px"><PlatformIcon :platform="platformOf(selected)" :size="14" />開啟貼文</a>
        </div>
      </div>

      <ConversationList :rows="replies" :show-parts="platformOf(selected) === 'threads'" @changed="refresh" />
    </section>
  </div>
</template>
