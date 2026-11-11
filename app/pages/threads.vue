<script setup lang="ts">
// 串文管理：Threads 發得多，大部分不屬於任何系列文。左邊看每則貼文的成效，右邊看回覆、手動回一句，或把貼文放進系列文
type ThreadPost = InsightPost & { seriesId: number | null, received: number, pending: number }
const { accounts } = useLookup()
const posts = ref<ThreadPost[]>([])
const series = ref<{ id: number, name: string }[]>([])
const loaded = ref(false)
const syncing = ref(false)
const filter = ref<'all' | 'pending' | 'loose'>('all')
const selectedId = ref(0)
const replies = ref<CommentRow[]>([])
const targetId = ref(0)
const draft = ref('')
const busy = ref(false)

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
const open = (c: CommentRow) => c.status === 'unmatched' || c.status === 'skipped'
const target = computed(() => replies.value.find(c => c.id === targetId.value && open(c)))

async function load() {
  const data = await attempt(() => api<{ posts: ThreadPost[], series: { id: number, name: string }[] }>('/api/threads'))
  if (data) {
    posts.value = data.posts
    series.value = data.series
    if (!selected.value && data.posts.length) await pick((data.posts.find(p => p.pending > 0) ?? data.posts[0]!).id)
  }
  loaded.value = true
}
async function pick(id: number) {
  selectedId.value = id
  draft.value = ''
  replies.value = await attempt(() => api<CommentRow[]>(`/api/threads/${id}`)) ?? []
  targetId.value = replies.value.find(open)?.id ?? 0
}
onMounted(load)

/** 右邊的回覆有變動後，把左邊那則貼文的「未回」數字跟著更新 */
function recount() {
  const post = selected.value
  if (!post) return
  post.received = replies.value.length
  post.pending = replies.value.filter(c => c.status !== 'sent' && c.status !== 'handled').length
  if (!target.value) targetId.value = replies.value.find(open)?.id ?? 0
}
const replace = (row: CommentRow) => {
  replies.value = replies.value.map(c => (c.id === row.id ? row : c))
  recount()
}

async function sync() {
  syncing.value = true
  const data = await attempt(() => api<{ errors: string[] }>('/api/insights/sync', { method: 'POST' }))
  syncing.value = false
  if (data) notify(data.errors.length ? data.errors.join('；') : '已同步')
  await load()
  if (selectedId.value) await pick(selectedId.value)
}
async function setSeries(value: string) {
  const post = selected.value
  if (!post) return
  const seriesId = value ? Number(value) : null
  if (await attempt(() => api(`/api/threads/${post.id}/series`, { method: 'PUT', body: { seriesId } }), '已儲存')) post.seriesId = seriesId
}
async function reply() {
  const c = target.value
  if (!c || !draft.value.trim()) return
  busy.value = true
  const row = await attempt(() => api<CommentRow>(`/api/comments/${c.id}/reply`, { method: 'POST', body: { text: draft.value.trim() } }), '已回覆')
  busy.value = false
  if (row) {
    draft.value = ''
    replace(row)
  }
  // 送出失敗時伺服器已經把這則改成「待送出」並記下原因，重新讀一次才看得到
  else if (selectedId.value) {
    replies.value = await attempt(() => api<CommentRow[]>(`/api/threads/${selectedId.value}`)) ?? replies.value
    recount()
  }
}
async function resend(c: CommentRow) {
  busy.value = true
  const row = await attempt(() => api<CommentRow>(`/api/comments/${c.id}/send`, { method: 'POST' }), '已送出')
  busy.value = false
  if (row) replace(row)
}
async function dismiss(c: CommentRow) {
  const row = await attempt(() => api<CommentRow>(`/api/comments/${c.id}`, { method: 'PATCH', body: { status: 'handled' } }))
  if (row) replace(row)
}
</script>

<template>
  <div class="row between">
    <div class="row" role="group" aria-label="篩選貼文">
      <button type="button" class="chip" :aria-pressed="filter === 'all'" @click="filter = 'all'">全部</button>
      <button type="button" class="chip" :aria-pressed="filter === 'pending'" @click="filter = 'pending'">有未回的回覆</button>
      <button type="button" class="chip" :aria-pressed="filter === 'loose'" @click="filter = 'loose'">未歸入系列文</button>
    </div>
    <button type="button" class="btn" :disabled="syncing || !threadAccounts.length" @click="sync">{{ syncing ? '同步中…' : '立即同步' }}</button>
  </div>

  <div class="stats">
    <div class="stat"><span class="small muted">近 28 天貼文</span><b>{{ fmtNum(recent.posts) }} 則</b></div>
    <div class="stat"><span class="small muted">觀看</span><b>{{ fmtNum(recent.views) }}</b></div>
    <div class="stat"><span class="small muted">互動率</span><b>{{ rate(recent.engagement, recent.views) }}</b></div>
    <div class="stat"><span class="small muted">還沒回的回覆</span><b>{{ fmtNum(pendingTotal) }} 則</b></div>
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
            <span v-if="p.pending" class="tag" style="flex: none; background: var(--warn-bg); color: var(--warn)">{{ p.pending }} 則未回</span>
          </span>
          <span class="row small muted" style="gap: 2px 14px">
            <span v-if="threadAccounts.length > 1">{{ accountName(p.accountId) }}</span>
            <span>{{ dayOf(p.publishedAt) }}</span>
            <span>觀看 {{ fmtNum(p.views) }}</span>
            <span>讚 {{ fmtNum(p.likes) }}</span>
            <span>回覆 {{ fmtNum(p.comments) }}</span>
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
        </div>
      </div>
      <label class="thread-series">
        <span class="small bold">系列文</span>
        <select :value="selected.seriesId ?? ''" @change="setSeries(($event.target as HTMLSelectElement).value)">
          <option value="">不加入</option>
          <option v-for="s in series" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </label>

      <div class="comment-log fill scroll" tabindex="0" aria-label="回覆">
        <div v-for="c in replies" :key="c.id" class="comment-item">
          <div class="row between" style="gap: 6px 12px">
            <span class="small muted">{{ c.author }} · {{ dayOf(c.createdAt) }}</span>
            <span v-if="c.status === 'sent'" class="tag" style="background: var(--green-soft); color: var(--green-deep)">已回覆</span>
            <span v-else-if="c.status === 'ready'" class="tag" :style="c.error ? 'background: var(--danger-bg); color: var(--danger)' : 'background: var(--warn-bg); color: var(--warn)'">{{ c.error ? '送出失敗' : '待送出' }}</span>
            <span v-else-if="c.status === 'handled'" class="tag" style="background: var(--chip-bg); color: var(--muted)">不用回</span>
          </div>
          <span class="wrap-any">{{ c.text }}</span>
          <span v-if="c.replyText" class="small wrap-any" style="color: var(--green-deep)">你：{{ c.replyText }}</span>
          <div v-if="c.error" class="error">{{ c.error }}</div>
          <div v-if="c.status === 'ready' || open(c)" class="row">
            <button v-if="c.status === 'ready'" type="button" class="btn sm" :disabled="busy" @click="resend(c)">{{ c.error ? '重送' : '送出回覆' }}</button>
            <template v-else>
              <button type="button" class="chip" :aria-pressed="c.id === targetId" :aria-label="`回覆 ${c.author}`" @click="targetId = c.id">回覆</button>
              <button type="button" class="btn sm" :aria-label="`${c.author} 的回覆不用回`" @click="dismiss(c)">不用回</button>
            </template>
          </div>
        </div>
        <div v-if="!replies.length" class="empty">還沒有人回覆</div>
      </div>

      <form v-if="target" class="col shrink" style="gap: 8px" @submit.prevent="reply">
        <label class="field">回覆 {{ target.author }}
          <textarea v-model="draft" rows="2" maxlength="500" required style="resize: none" />
        </label>
        <div class="row" style="justify-content: flex-end">
          <button type="submit" class="btn primary" :disabled="busy || !draft.trim()">{{ busy ? '送出中…' : '送出' }}</button>
        </div>
      </form>
    </section>
  </div>
</template>
