<script setup lang="ts">
// 對話：留言紀錄整理成一張張卡片（一個人在一則貼文底下的往來算一張），點卡片在同一個區塊裡展開成整串對話。
// 串文管理與系列文成效頁共用。資料有變動時發出 changed，由外面重新讀取 rows。
const props = defineProps<{ rows: CommentRow[], showPlatform?: boolean, showParts?: boolean }>()
const emit = defineEmits<{ changed: [] }>()
const { account } = useLookup()

const grouped = computed(() => groupConversations(props.rows.map(r => ({ ...r }))))
// 子文串只在看單一則 Threads 貼文時有意義
const parts = computed(() => (props.showParts ? [...grouped.value.parts.values()][0] ?? [] : []))
const filter = ref<'all' | 'waiting'>('all')
const part = ref(-1) // -1 全部、0 主文、1 以上是第幾則子文
const openKey = ref('')
const draft = ref('')
const busy = ref(false)

const countIn = (index: number) => grouped.value.conversations.filter(c => c.part === index).length
const filtered = computed(() => grouped.value.conversations.filter(c =>
  (part.value < 0 || c.part === part.value) && (filter.value === 'all' || c.waiting)))
const PAGE_SIZE = 8
const page = ref(1)
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const shown = computed(() => filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
const listEl = ref<HTMLElement>()
function goPage(n: number) {
  page.value = Math.min(Math.max(1, n), pages.value)
  listEl.value?.scrollTo({ top: 0 })
}
watch([filter, part], () => goPage(1))
// 換了一則貼文（rows 整批換掉）就回到卡片清單
watch(() => props.rows[0]?.externalPostId, () => {
  if (props.showParts) {
    openKey.value = ''
    part.value = -1
  }
})

const timeOf = (iso: string) => minutesToAt(Math.floor(Date.parse(iso) / 60000) + 480).replace('T', ' ').slice(5).replace('-', '/')
const whereOf = (index: number) => (index ? `子文 ${index + 1}` : '主文')

interface Message { key: string, who: string, at: string, text: string, mine: boolean, tag: string, row?: CommentRow }
const current = computed(() => grouped.value.conversations.find(c => c.key === openKey.value))
const messages = computed<Message[]>(() => {
  const conv = current.value
  if (!conv) return []
  const out: Message[] = []
  for (const row of conv.rows) {
    out.push({ key: `r${row.id}`, who: row.mine ? '我' : row.author, at: row.createdAt, text: row.text, mine: row.mine, tag: row.mine ? row.reason : '', row })
    if (row.mine || row.status !== 'sent') continue
    // 舊紀錄的回覆記在同一筆上，沒有另外一筆「我的回覆」：補一句進來
    const answered = conv.rows.some(r => r.mine && r.parentExternalId === row.externalId)
    if (row.replyText && !answered) out.push({ key: `a${row.id}`, who: '我', at: row.createdAt, text: row.replyText, mine: true, tag: row.reason === '手動回覆' ? '手動回覆' : '自動回覆' })
    if (row.dmText && !row.error) out.push({ key: `d${row.id}`, who: '我', at: row.createdAt, text: row.dmText, mine: true, tag: '私訊' })
  }
  return out
})
// 回覆的對象：對方最後說話的那一則
const replyTo = computed(() => [...(current.value?.rows ?? [])].reverse().find(r => !r.mine && r.externalId))
const contextOf = computed(() => {
  const conv = current.value
  if (!conv) return ''
  return conv.part ? parts.value[conv.part - 1]?.text ?? '' : conv.root.postTitle
})

function open(key: string) {
  openKey.value = key
  draft.value = ''
}
async function run(fn: () => Promise<unknown>, done?: string) {
  busy.value = true
  const ok = await attempt(fn, done)
  busy.value = false
  // 失敗時伺服器可能已經記下原因，一樣重新讀
  emit('changed')
  return ok !== undefined
}
async function reply() {
  const target = replyTo.value
  if (!target || !draft.value.trim()) return
  if (await run(() => api(`/api/comments/${target.id}/reply`, { method: 'POST', body: { text: draft.value.trim() } }), '已回覆')) draft.value = ''
}
const resend = (row: CommentRow) => run(() => api(`/api/comments/${row.id}/send`, { method: 'POST' }), '已送出')
async function dismiss() {
  const last = current.value?.last
  if (!last || last.mine) return
  if (await run(() => api(`/api/comments/${last.id}`, { method: 'PATCH', body: { status: 'handled' } }))) openKey.value = ''
}
</script>

<template>
  <div v-if="!current" class="conv">
    <div class="row between">
      <div v-if="parts.length" class="row" role="group" aria-label="主文與子文串">
        <button type="button" class="chip" :aria-pressed="part === -1" @click="part = -1">全部</button>
        <button type="button" class="chip" :aria-pressed="part === 0" @click="part = 0">主文 · {{ countIn(0) }}</button>
        <button v-for="(p, i) in parts" :key="p.id" type="button" class="chip" :aria-pressed="part === i + 1" @click="part = i + 1">{{ whereOf(i + 1) }} · {{ countIn(i + 1) }}</button>
      </div>
      <div class="row" style="margin-left: auto">
        <button type="button" class="chip" :aria-pressed="filter === 'waiting'" @click="filter = filter === 'waiting' ? 'all' : 'waiting'">只看待回覆</button>
      </div>
    </div>
    <p v-if="part > 0" class="conv-context wrap-any">{{ parts[part - 1]?.text }}</p>
    <div ref="listEl" class="conv-cards fill scroll">
      <button v-for="c in shown" :key="c.key" type="button" class="conv-card" @click="open(c.key)">
        <span class="row between" style="gap: 8px; flex-wrap: nowrap">
          <span class="pf-row bold" style="gap: 6px; font-size: 14px"><PlatformIcon v-if="showPlatform" :platform="account(c.root.accountId)?.platform" :size="14" />{{ c.root.author }}</span>
          <span class="tag" style="flex: none" :style="c.waiting ? 'background: var(--warn-bg); color: var(--warn)' : 'background: var(--green-soft); color: var(--green-deep)'">{{ c.waiting ? '待回覆' : '已回覆' }}</span>
        </span>
        <span class="conv-first">{{ c.root.text }}</span>
        <span class="row small muted" style="gap: 2px 12px">
          <span v-if="parts.length">回在{{ whereOf(c.part) }}</span>
          <span>{{ c.rows.length }} 則對話</span>
          <span>最後：{{ c.last.mine || c.last.status === 'sent' ? '我' : c.last.author }} · {{ timeOf(c.last.createdAt) }}</span>
        </span>
      </button>
      <div v-if="!shown.length" class="empty">沒有對話</div>
    </div>
    <div v-if="pages > 1" class="row between" role="navigation" aria-label="對話分頁">
      <button type="button" class="btn sm" :disabled="page <= 1" @click="goPage(page - 1)">上一頁</button>
      <span class="small muted" aria-live="polite">第 {{ page }} / {{ pages }} 頁</span>
      <button type="button" class="btn sm" :disabled="page >= pages" @click="goPage(page + 1)">下一頁</button>
    </div>
  </div>

  <div v-else class="conv">
    <div class="row between">
      <button type="button" class="btn sm" @click="openKey = ''">← 全部對話</button>
      <span class="small muted"><template v-if="parts.length">回在{{ whereOf(current.part) }} · </template>{{ messages.length }} 則對話</span>
    </div>
    <h3 class="pf-row" style="gap: 6px"><PlatformIcon v-if="showPlatform" :platform="account(current.root.accountId)?.platform" :size="16" />{{ current.root.author }}</h3>
    <p v-if="contextOf" class="conv-context wrap-any">{{ contextOf }}</p>
    <ol class="conv-line fill scroll" tabindex="0" aria-label="對話內容">
      <li v-for="m in messages" :key="m.key" :class="{ mine: m.mine }">
        <span class="row small muted" style="gap: 4px 10px">
          <span class="bold" :style="m.mine ? 'color: var(--green-deep)' : 'color: var(--ink)'">{{ m.who }}</span>
          <span>{{ timeOf(m.at) }}</span>
          <span v-if="m.tag" class="tag" style="background: var(--green-soft); color: var(--green-deep)">{{ m.tag }}</span>
        </span>
        <span class="conv-text wrap-any">{{ m.text }}</span>
        <template v-if="m.row && !m.row.mine">
          <div v-if="m.row.status === 'ready'" class="col" style="gap: 6px">
            <span class="small wrap-any" style="color: var(--warn)">待送出：{{ m.row.replyText || m.row.dmText }}</span>
            <div v-if="m.row.error" class="error">{{ m.row.error }}</div>
            <div class="row"><button type="button" class="btn sm" :disabled="busy" @click="resend(m.row)">{{ m.row.error ? '重送' : '送出回覆' }}</button></div>
          </div>
          <div v-else-if="m.row.error" class="error">{{ m.row.error }}</div>
        </template>
      </li>
    </ol>
    <form v-if="replyTo" class="col shrink" style="gap: 8px" @submit.prevent="reply">
      <label class="field">回覆 {{ replyTo.author }}
        <textarea v-model="draft" rows="2" maxlength="500" required style="resize: none" />
      </label>
      <div class="row" style="justify-content: flex-end">
        <button v-if="current.waiting" type="button" class="btn" :disabled="busy" @click="dismiss">不用回</button>
        <button type="submit" class="btn primary" :disabled="busy || !draft.trim()">{{ busy ? '送出中…' : '送出' }}</button>
      </div>
    </form>
  </div>
</template>
