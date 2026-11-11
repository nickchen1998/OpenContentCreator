<script setup lang="ts">
// 系列文的成效：合計、系列裡每則貼文、留言紀錄
const id = Number(useRoute().params.id)
const { accountLabel } = useLookup()
const series = ref<Series>()
const comments = ref<CommentRow[]>([])
const missing = ref(false)
const filter = ref<'all' | 'failed' | 'open'>('all')
const busyId = ref(0)

async function load() {
  try {
    const data = await api<{ series: Series, comments: CommentRow[] }>(`/api/series/${id}`)
    series.value = data.series
    comments.value = data.comments
  }
  catch {
    missing.value = true
  }
}
onMounted(load)

const totals = computed(() => totalsOf(series.value?.posts ?? []))
const rate = (eng: number, views: number) => (views ? `${(eng / views * 100).toFixed(1)}%` : '—')
const dayOf = (iso: string) => fmtDay(minutesToAt(Math.floor(Date.parse(iso) / 60000) + 480).slice(0, 10))
const timeOf = (iso: string) => minutesToAt(Math.floor(Date.parse(iso) / 60000) + 480).replace('T', ' ').slice(5)
// 每則貼文收到幾則留言、送出幾則私訊（留言紀錄裡同一個帳號、同一段貼文文字的）
const failed = (c: CommentRow) => c.status === 'ready' && Boolean(c.error)
const dmFailed = (c: CommentRow) => c.status === 'sent' && Boolean(c.error)
const stateOf = (c: CommentRow) => {
  if (failed(c)) return { label: '送出失敗', style: 'background: var(--danger-bg); color: var(--danger)' }
  if (dmFailed(c)) return { label: '已回覆，私訊失敗', style: 'background: var(--warn-bg); color: var(--warn)' }
  if (c.status === 'sent') return { label: c.dmText ? '已回覆＋私訊' : '已回覆', style: 'background: var(--green-soft); color: var(--green-deep)' }
  if (c.status === 'ready') return { label: '待送出', style: 'background: var(--warn-bg); color: var(--warn)' }
  if (c.status === 'handled') return { label: '已處理', style: 'background: var(--chip-bg); color: var(--muted)' }
  return { label: c.status === 'unmatched' ? '沒有關鍵字' : '已回過，不重複', style: 'background: var(--chip-bg); color: var(--muted)' }
}
const shown = computed(() => comments.value.filter(c =>
  filter.value === 'all' || (filter.value === 'failed' ? failed(c) || dmFailed(c) : c.status === 'unmatched' || c.status === 'skipped' || c.status === 'ready')))

async function send(c: CommentRow) {
  busyId.value = c.id
  const row = await attempt(() => api<CommentRow>(`/api/comments/${c.id}/send`, { method: 'POST' }), '已送出')
  busyId.value = 0
  if (row) Object.assign(c, row)
  else await load()
}
async function remove(c: CommentRow) {
  if (!confirm('刪除這筆留言紀錄？')) return
  if (await attempt(() => api(`/api/comments/${c.id}`, { method: 'DELETE' }))) comments.value = comments.value.filter(x => x.id !== c.id)
}
</script>

<template>
  <div v-if="missing" class="empty">找不到這個系列文。<NuxtLink to="/">返回儀表板</NuxtLink></div>
  <template v-else-if="series">
    <div class="row between">
      <div class="row" style="gap: 12px">
        <NuxtLink to="/" class="btn-text" style="padding-left: 0">← 儀表板</NuxtLink>
        <h1 class="wrap-any">{{ series.name }}</h1>
        <span class="pill" :class="{ muted: !series.enabled || !series.replies.length }">{{ !series.replies.length ? '只看成效' : series.enabled ? '自動回覆啟用中' : '已暫停' }}</span>
      </div>
      <NuxtLink :to="`/series/${series.id}/edit`" class="btn">設定系列文</NuxtLink>
    </div>

    <div class="stats">
      <div class="stat"><span class="small muted">觀看</span><b>{{ fmtNum(totals.views) }}</b></div>
      <div class="stat"><span class="small muted">互動</span><b>{{ fmtNum(totals.engagement) }}</b></div>
      <div class="stat"><span class="small muted">互動率</span><b>{{ rate(totals.engagement, totals.views) }}</b></div>
      <div class="stat"><span class="small muted">收藏</span><b>{{ fmtNum(totals.saves) }}</b></div>
      <div class="stat"><span class="small muted">留言</span><b>{{ fmtNum(series.received) }} 則</b></div>
      <div class="stat"><span class="small muted">私訊送出</span><b>{{ fmtNum(series.dms) }} 則</b></div>
    </div>

    <section class="card">
      <h2>系列裡的貼文</h2>
      <div class="table-scroll">
        <table v-if="series.posts.length" style="min-width: 680px">
          <thead>
            <tr><th scope="col">貼文</th><th scope="col">發佈</th><th scope="col">觀看</th><th scope="col">互動</th><th scope="col">互動率</th><th scope="col">收藏</th></tr>
          </thead>
          <tbody>
            <tr v-for="p in series.posts" :key="p.id">
              <th scope="row">{{ accountLabel(p.accountId).split(' · ')[0] }}
                <div class="small" style="font-weight: 400"><a :href="p.url" target="_blank" rel="noopener noreferrer" style="color: var(--muted)">{{ p.text || '（沒有文字的貼文）' }}</a></div>
              </th>
              <td style="white-space: nowrap">{{ dayOf(p.publishedAt) }}</td>
              <td>{{ fmtNum(p.views) }}</td>
              <td>{{ fmtNum(engagementOf(p)) }}</td>
              <td>{{ rate(engagementOf(p), p.views) }}</td>
              <td>{{ fmtNum(p.saves) }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty">還沒有貼文　<NuxtLink :to="`/series/${series.id}/edit`">加入貼文</NuxtLink></div>
      </div>
    </section>

    <section class="card">
      <div class="row between">
        <h2>留言紀錄</h2>
        <div class="row" role="group" aria-label="篩選留言">
          <button type="button" class="chip" :aria-pressed="filter === 'all'" @click="filter = 'all'">全部</button>
          <button type="button" class="chip" :aria-pressed="filter === 'failed'" @click="filter = 'failed'">送出失敗</button>
          <button type="button" class="chip" :aria-pressed="filter === 'open'" @click="filter = 'open'">未回覆</button>
        </div>
      </div>
      <div class="col divided" style="gap: 12px">
        <div v-for="c in shown" :key="c.id" class="col" style="gap: 6px">
          <div class="row between" style="gap: 8px 16px">
            <div class="col grow" style="flex-basis: 320px; gap: 2px">
              <span class="small muted">{{ accountLabel(c.accountId).split(' · ')[0] }} · {{ c.author }} · {{ timeOf(c.createdAt) }}</span>
              <span class="wrap-any">{{ c.text }}</span>
            </div>
            <div class="row">
              <span class="tag" :style="stateOf(c).style">{{ stateOf(c).label }}</span>
              <button v-if="c.status === 'ready' && c.externalId" type="button" class="btn sm" :disabled="busyId === c.id" @click="send(c)">{{ c.error ? '重送' : '送出' }}</button>
              <button type="button" class="btn sm" :aria-label="`刪除 ${c.author} 的留言紀錄`" @click="remove(c)">刪除</button>
            </div>
          </div>
          <div v-if="c.error" class="error">{{ c.error }}</div>
        </div>
      </div>
      <div v-if="!shown.length" class="empty">沒有紀錄</div>
    </section>
  </template>
  <div v-else class="empty">載入中…</div>
</template>
