<script setup lang="ts">
// 對話：留言紀錄整理成一張張卡片（一個人在一則貼文底下的往來算一張），點卡片在同一個區塊裡展開成整串對話。
// 貼文管理與系列文成效頁共用。資料有變動時發出 changed，由外面重新讀取 rows。
// waitingOnly：只列出待回覆的對話（系列文成效頁右側的「待回覆」分頁）
const props = defineProps<{ rows: CommentRow[], showPlatform?: boolean, showParts?: boolean, waitingOnly?: boolean }>()
const emit = defineEmits<{ changed: [] }>()
const { account } = useLookup()

const grouped = computed(() => groupConversations(props.rows.map(r => ({ ...r }))))
// 子文串只在看單一則 Threads 貼文時有意義
const parts = computed(() => (props.showParts ? [...grouped.value.parts.values()][0] ?? [] : []))
const part = ref(-1) // -1 全部、0 主文、1 以上是第幾則子文
const openKey = ref('')
const draft = ref('')
const busy = ref(false)

const countIn = (index: number) => grouped.value.conversations.filter(c => c.part === index).length
// 待回覆的排在最前面（各自仍然是最近有動靜的在前），不然會被已回覆的擠到後面幾頁
const filtered = computed(() => {
  const list = grouped.value.conversations.filter(c => part.value < 0 || c.part === part.value)
  return [...list.filter(c => c.waiting), ...(props.waitingOnly ? [] : list.filter(c => !c.waiting))]
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
watch([part, () => props.waitingOnly], () => goPage(1))
// 換了一則貼文（rows 整批換掉）就回到卡片清單
watch(() => props.rows[0]?.externalPostId, () => {
  if (props.showParts) {
    openKey.value = ''
    part.value = -1
  }
})

const timeOf = (iso: string) => minutesToAt(Math.floor(Date.parse(iso) / 60000) + 480).replace('T', ' ').slice(5).replace('-', '/')
const whereOf = (index: number) => (index ? `子文 ${index + 1}` : '主文')

// 卡片的狀態：最後一句是對方說的 → 待回覆；按了「不用回」→ 不回（不是已回覆，因為實際上沒有回）
function stateOf(c: { waiting: boolean, last: CommentRow }) {
  if (c.waiting) return { label: '待回覆', style: 'background: var(--warn-bg); color: var(--warn)' }
  if (!c.last.mine && c.last.status === 'handled') return { label: '不回', style: 'background: var(--chip-bg); color: var(--muted)' }
  return { label: '已回覆', style: 'background: var(--green-soft); color: var(--green-deep)' }
}

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

// 常用回覆：這串對話所屬系列文的回覆句＋自己最常手動回的幾句。同一個系列文只問一次
const quick = ref<string[]>([])
let quickFor: number | null | undefined
async function loadQuick(seriesId: number | null) {
  if (quickFor === seriesId) return
  quickFor = seriesId
  quick.value = (await api<{ replies: string[] }>('/api/comments/quick', { query: { seriesId: seriesId ?? '' } }).catch(() => ({ replies: [] }))).replies
}
const waitingCount = computed(() => grouped.value.conversations.filter(c => c.waiting).length)

function open(key: string) {
  openKey.value = key
  draft.value = ''
  const conv = grouped.value.conversations.find(c => c.key === key)
  if (conv) loadQuick(conv.root.collectionId)
}
/** 處理完一串之後：跳到清單上下一串待回覆的；都處理完就回到卡片清單 */
function advance(doneKey: string) {
  const list = filtered.value
  const at = list.findIndex(c => c.key === doneKey)
  const next = [...list.slice(at + 1), ...list.slice(0, Math.max(at, 0))].find(c => c.waiting && c.key !== doneKey)
  if (next) open(next.key)
  else openKey.value = ''
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
  const key = openKey.value
  // 手動回完如果清單上還有別串在等，就接著處理下一串
  if (await run(() => api(`/api/comments/${target.id}/reply`, { method: 'POST', body: { text: draft.value.trim() } }), '已回覆')) {
    quickFor = undefined
    advance(key)
  }
}
const resend = (row: CommentRow) => run(() => api(`/api/comments/${row.id}/send`, { method: 'POST' }), '已送出')
async function dismiss() {
  const last = current.value?.last
  if (!last || last.mine) return
  const key = openKey.value
  if (await run(() => api(`/api/comments/${last.id}`, { method: 'PATCH', body: { status: 'handled' } }))) advance(key)
}
</script>

<template>
  <div v-if="!current" class="conv">
    <div v-if="parts.length" class="row">
      <div class="row" role="group" aria-label="主文與子文串">
        <button type="button" class="chip" :aria-pressed="part === -1" @click="part = -1">全部</button>
        <button type="button" class="chip" :aria-pressed="part === 0" @click="part = 0">主文 · {{ countIn(0) }}</button>
        <button v-for="(p, i) in parts" :key="p.id" type="button" class="chip" :aria-pressed="part === i + 1" @click="part = i + 1">{{ whereOf(i + 1) }} · {{ countIn(i + 1) }}</button>
      </div>
    </div>
    <p v-if="part > 0" class="conv-context wrap-any">{{ parts[part - 1]?.text }}</p>
    <div ref="listEl" class="conv-cards fill scroll">
      <button v-for="c in shown" :key="c.key" type="button" class="conv-card" @click="open(c.key)">
        <span class="row between" style="gap: 8px; flex-wrap: nowrap">
          <span class="pf-row bold" style="gap: 6px; font-size: 15px"><PlatformIcon v-if="showPlatform" :platform="account(c.root.accountId)?.platform" :size="14" />{{ c.root.author }}</span>
          <span class="tag" style="flex: none" :style="stateOf(c).style">{{ stateOf(c).label }}</span>
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
      <span class="small muted"><template v-if="parts.length">回在{{ whereOf(current.part) }} · </template>還有 {{ waitingCount }} 串待回覆</span>
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
        <span v-if="m.row && !m.row.mine && m.row.status === 'handled'" class="small muted">已標成不回</span>
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
      <div v-if="quick.length" class="quick-replies" role="group" aria-label="常用回覆">
        <button v-for="q in quick" :key="q" type="button" class="chip" :title="q" @click="draft = q">{{ q.length > 14 ? `${q.slice(0, 14)}…` : q }}</button>
      </div>
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
