<script setup lang="ts">
const boot = useBoot()
const { accountLabel, group, account } = useLookup()
const rules = ref<ReplyRule[]>([])
const comments = ref<CommentRow[]>([])
const selected = ref(0)
const filter = ref<'all' | 'comment' | 'message'>('all')
const error = ref('')

async function load() {
  const [r, c] = await Promise.all([attempt(() => api<ReplyRule[]>('/api/rules')), attempt(() => api<CommentRow[]>('/api/comments'))])
  rules.value = r ?? []
  comments.value = c ?? []
  if (!comments.value.some(x => x.id === selected.value)) selected.value = comments.value[0]?.id ?? 0
}
onMounted(load)
const shown = computed(() => comments.value.filter(c => filter.value === 'all' || c.kind === filter.value))
const sel = computed(() => comments.value.find(c => c.id === selected.value))

// 規則
const ruleOpen = ref(false)
const editing = ref<ReplyRule>()
const blank = () => ({ externalPostId: '', postLabel: '', name: '', groupId: boot.value.groups[0]?.id ?? 0, accountId: null as number | null, channel: 'comment' as 'comment' | 'message', matchType: 'keyword' as 'keyword' | 'any', keywords: '', action: 'reply' as 'reply' | 'reply_dm', repliesText: '', dmText: '', enabled: true })
const form = reactive(blank())
function openRule(rule?: ReplyRule) {
  editing.value = rule
  error.value = ''
  Object.assign(form, rule ? { ...rule, repliesText: rule.replies.join('\n') } : blank())
  ruleOpen.value = true
  loadRemotePosts()
}
// 指定貼文：從帳號在平台上最近的貼文挑
interface RemotePost { id: string, url: string, text: string }
const remotePosts = ref<RemotePost[]>([])
const remoteState = ref<'idle' | 'loading' | 'error'>('idle')
async function loadRemotePosts() {
  remotePosts.value = []
  remoteState.value = 'idle'
  if (form.accountId == null || form.channel !== 'comment') return
  remoteState.value = 'loading'
  try {
    remotePosts.value = await api<RemotePost[]>(`/api/accounts/${form.accountId}/posts`)
    remoteState.value = 'idle'
  }
  catch {
    remoteState.value = 'error' // 還沒連結的帳號
  }
}
function pickAccount() {
  Object.assign(form, { externalPostId: '', postLabel: '' })
  loadRemotePosts()
}
function pickPost() {
  form.postLabel = remotePosts.value.find(p => p.id === form.externalPostId)?.text || (form.externalPostId ? '（沒有文字的貼文）' : '')
}
// 目前選的貼文已經不在最近 30 則裡時，仍然要列在選單上
const postOptions = computed(() => (form.externalPostId && !remotePosts.value.some(p => p.id === form.externalPostId)
  ? [{ id: form.externalPostId, url: '', text: form.postLabel }, ...remotePosts.value]
  : remotePosts.value))
async function saveRule() {
  error.value = ''
  const body = { ...form, postId: editing.value?.postId ?? null, replies: form.repliesText.split('\n').map(s => s.trim()).filter(Boolean) }
  try {
    await api(editing.value ? `/api/rules/${editing.value.id}` : '/api/rules', { method: editing.value ? 'PATCH' : 'POST', body })
    ruleOpen.value = false
    await load()
  }
  catch (e: any) {
    error.value = e.message
  }
}
async function removeRule() {
  if (!confirm(`刪除規則「${editing.value!.name}」？`)) return
  if (await attempt(() => api(`/api/rules/${editing.value!.id}`, { method: 'DELETE' }))) {
    ruleOpen.value = false
    await load()
  }
}
async function toggle(rule: ReplyRule) {
  if (await attempt(() => api(`/api/rules/${rule.id}`, { method: 'PATCH', body: { enabled: !rule.enabled } }))) rule.enabled = !rule.enabled
}
const scope = (r: ReplyRule) => [group(r.groupId)?.name, r.accountId ? PLATFORMS[account(r.accountId)?.platform ?? 'facebook'].label : '全部帳號', r.externalPostId ? `「${r.postLabel.length > 14 ? `${r.postLabel.slice(0, 14)}…` : r.postLabel}」` : null].filter(Boolean).join(' · ')
const noun = (kind: string) => (kind === 'message' ? '私訊' : '留言')
const actionOf = (r: ReplyRule) => (r.channel === 'message' ? '回覆私訊' : r.action === 'reply_dm' ? '回覆留言＋私訊' : '回覆留言')

// 手動貼入（測試規則，或還沒連結的帳號）
const commentOpen = ref(false)
const cform = reactive({ accountId: 0, kind: 'comment' as 'comment' | 'message', postTitle: '', author: '', text: '' })
function openComment() {
  error.value = ''
  Object.assign(cform, { accountId: cform.accountId || boot.value.groups[0]?.accounts[0]?.id || 0, postTitle: '', author: '', text: '' })
  commentOpen.value = true
}
async function saveComment() {
  error.value = ''
  try {
    const row = await api<CommentRow>('/api/comments', { method: 'POST', body: { ...cform } })
    commentOpen.value = false
    await load()
    selected.value = row.id
  }
  catch (e: any) {
    error.value = e.message
  }
}
async function mark(status: 'sent' | 'handled') {
  const row = await attempt(() => api<CommentRow>(`/api/comments/${sel.value!.id}`, { method: 'PATCH', body: { status } }))
  if (row) Object.assign(sel.value!, row)
}
const sending = ref(false)
async function send() {
  sending.value = true
  const row = await attempt(() => api<CommentRow>(`/api/comments/${sel.value!.id}/send`, { method: 'POST' }), '已送出')
  sending.value = false
  if (row) Object.assign(sel.value!, row)
  else await load()
}
async function removeComment() {
  if (!confirm('刪除這筆紀錄？')) return
  if (await attempt(() => api(`/api/comments/${sel.value!.id}`, { method: 'DELETE' }))) await load()
}
async function copy(text: string) {
  await navigator.clipboard.writeText(text).catch(() => {})
  notify('已複製')
}
const STATE = { ready: '待送出', sent: '已回覆', unmatched: '未命中', skipped: '不回覆', handled: '已處理' }
const stateStyle = (c: CommentRow) => (c.error && c.status === 'ready'
  ? 'background: var(--danger-bg); color: var(--danger)'
  : c.status === 'sent' ? 'background: var(--green-soft); color: var(--green-deep)' : c.status === 'ready' ? 'background: var(--warn-bg); color: var(--warn)' : 'background: var(--chip-bg); color: var(--muted)')
const stateLabel = (c: CommentRow) => (c.error && c.status === 'ready' ? '送出失敗' : STATE[c.status])
</script>

<template>
  <section class="card">
    <div class="row between">
      <h2>規則</h2>
      <button type="button" class="btn primary" :disabled="!boot.groups.length" @click="openRule()">新增規則</button>
    </div>
    <div class="table-scroll">
      <table v-if="rules.length" style="min-width: 760px">
        <thead>
          <tr><th scope="col">規則</th><th scope="col">對象</th><th scope="col">範圍</th><th scope="col">觸發</th><th scope="col">動作</th><th scope="col">回覆</th><th scope="col">操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in rules" :key="r.id" :style="r.enabled ? '' : 'opacity: .55'">
            <th scope="row" style="white-space: nowrap">{{ r.name }}</th>
            <td><span class="pill" :class="{ muted: r.channel === 'message' }">{{ noun(r.channel) }}</span></td>
            <td>{{ scope(r) }}</td>
            <td>{{ r.matchType === 'any' ? `任何${noun(r.channel)}` : `含「${r.keywords}」` }}</td>
            <td style="white-space: nowrap">{{ actionOf(r) }}</td>
            <td style="white-space: nowrap">{{ r.replies.length }} 句</td>
            <td>
              <div class="row" style="flex-wrap: nowrap">
                <button type="button" class="btn sm" @click="toggle(r)">{{ r.enabled ? '停用' : '啟用' }}</button>
                <button type="button" class="btn sm" :aria-label="`編輯 ${r.name}`" @click="openRule(r)">編輯</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">還沒有規則</div>
    </div>
  </section>

  <div class="grid-2">
    <section class="card" style="padding: 14px; gap: 8px" aria-label="紀錄">
      <div class="row between" style="margin: 4px 8px">
        <div class="row" role="group" aria-label="篩選">
          <button type="button" class="chip" :aria-pressed="filter === 'all'" @click="filter = 'all'">全部</button>
          <button type="button" class="chip" :aria-pressed="filter === 'comment'" @click="filter = 'comment'">留言</button>
          <button type="button" class="chip" :aria-pressed="filter === 'message'" @click="filter = 'message'">私訊</button>
        </div>
        <button type="button" class="btn sm" :disabled="!boot.groups.some(g => g.accounts.length)" @click="openComment">手動貼入</button>
      </div>
      <button v-for="c in shown" :key="c.id" type="button" class="list-btn" :aria-pressed="c.id === selected" @click="selected = c.id">
        <span class="row between" style="flex-wrap: nowrap">
          <span class="small muted">{{ accountLabel(c.accountId) }} · {{ noun(c.kind) }} · {{ c.author }}</span>
          <span class="tag" :style="stateStyle(c)">{{ stateLabel(c) }}</span>
        </span>
        <span class="wrap-any">{{ c.text }}</span>
      </button>
      <div v-if="!shown.length" class="empty">沒有紀錄</div>
    </section>

    <section v-if="sel" class="card" style="gap: 14px" aria-label="內容">
      <div class="col">
        <div class="small muted">{{ accountLabel(sel.accountId) }} · {{ noun(sel.kind) }}<template v-if="sel.postTitle"> ·「{{ sel.postTitle }}」</template></div>
        <div class="bold">{{ sel.author }}</div>
      </div>
      <div class="box wrap-any" style="line-height: 1.7; padding: 14px 16px">{{ sel.text }}</div>
      <div class="small" style="color: var(--ink-2)">{{ sel.reason }}</div>
      <div v-if="sel.error" class="error" role="alert">{{ sel.error }}</div>
      <div v-if="sel.replyText" class="col" style="gap: 6px">
        <div class="small muted">回覆</div>
        <div class="row" style="flex-wrap: nowrap; align-items: stretch">
          <div class="grow box wrap-any" style="background: var(--card)">{{ sel.replyText }}</div>
          <button type="button" class="btn sm" @click="copy(sel.replyText)">複製</button>
        </div>
      </div>
      <div v-if="sel.dmText" class="col" style="gap: 6px">
        <div class="small muted">私訊</div>
        <div class="row" style="flex-wrap: nowrap; align-items: stretch">
          <div class="grow box pre" style="background: var(--card)">{{ sel.dmText }}</div>
          <button type="button" class="btn sm" @click="copy(sel.dmText)">複製</button>
        </div>
      </div>
      <div class="row">
        <template v-if="sel.status === 'ready'">
          <button v-if="sel.externalId" type="button" class="btn primary" :disabled="sending" @click="send">{{ sel.error ? '重送' : '送出' }}</button>
          <button type="button" class="btn" @click="mark('sent')">標示為已回覆</button>
        </template>
        <button v-if="sel.status === 'unmatched' || sel.status === 'skipped'" type="button" class="btn" @click="mark('handled')">標示為已處理</button>
        <button type="button" class="btn danger" @click="removeComment">刪除</button>
      </div>
    </section>
  </div>

  <AppDialog v-model="ruleOpen" :title="editing ? '編輯規則' : '新增規則'" :error="error" @submit="saveRule">
    <label class="field">名稱<input v-model="form.name" type="text" maxlength="40" required></label>
    <div class="row" role="group" aria-label="對象">
      <button type="button" class="chip" :aria-pressed="form.channel === 'comment'" @click="form.channel = 'comment'; loadRemotePosts()">留言</button>
      <button type="button" class="chip" :aria-pressed="form.channel === 'message'" @click="form.channel = 'message'">私訊</button>
    </div>
    <div class="row" style="align-items: flex-end">
      <label class="field grow">群組
        <select v-model="form.groupId" @change="form.accountId = null; pickAccount()">
          <option v-for="g in boot.groups" :key="g.id" :value="g.id">{{ g.name }}</option>
        </select>
      </label>
      <label class="field grow">帳號
        <select v-model="form.accountId" @change="pickAccount">
          <option :value="null">全部帳號</option>
          <option v-for="a in group(form.groupId)?.accounts" :key="a.id" :value="a.id">{{ PLATFORMS[a.platform].label }}・{{ a.name }}</option>
        </select>
      </label>
    </div>
    <label v-if="form.channel === 'comment' && form.accountId != null && remoteState !== 'error'" class="field">貼文
      <select v-model="form.externalPostId" :disabled="remoteState === 'loading'" @change="pickPost">
        <option value="">{{ remoteState === 'loading' ? '載入中…' : '全部貼文' }}</option>
        <option v-for="p in postOptions" :key="p.id" :value="p.id">{{ p.text || '（沒有文字的貼文）' }}</option>
      </select>
    </label>
    <div class="row" style="align-items: flex-end">
      <label class="field grow">觸發
        <select v-model="form.matchType"><option value="keyword">含關鍵字</option><option value="any">任何{{ noun(form.channel) }}</option></select>
      </label>
      <label v-if="form.matchType === 'keyword'" class="field grow">關鍵字（逗號分隔）
        <input v-model="form.keywords" type="text" maxlength="200" required>
      </label>
    </div>
    <label class="field">回覆內容（一行一句，輪流使用）
      <textarea v-model="form.repliesText" rows="4" required />
    </label>
    <template v-if="form.channel === 'comment'">
      <label class="check"><input type="checkbox" :checked="form.action === 'reply_dm'" @change="form.action = form.action === 'reply_dm' ? 'reply' : 'reply_dm'">同時私訊留言者</label>
      <label v-if="form.action === 'reply_dm'" class="field">私訊內容
        <textarea v-model="form.dmText" rows="3" maxlength="1000" required />
      </label>
    </template>
    <template v-if="editing" #actions>
      <button type="button" class="btn danger" style="margin-right: auto" @click="removeRule">刪除</button>
    </template>
  </AppDialog>

  <AppDialog v-model="commentOpen" title="手動貼入" submit-label="套用規則" :error="error" @submit="saveComment">
    <div class="row" role="group" aria-label="類型">
      <button type="button" class="chip" :aria-pressed="cform.kind === 'comment'" @click="cform.kind = 'comment'">留言</button>
      <button type="button" class="chip" :aria-pressed="cform.kind === 'message'" @click="cform.kind = 'message'">私訊</button>
    </div>
    <label class="field">帳號
      <select v-model="cform.accountId">
        <template v-for="g in boot.groups" :key="g.id">
          <option v-for="a in g.accounts" :key="a.id" :value="a.id">{{ g.name }} · {{ PLATFORMS[a.platform].label }}・{{ a.name }}</option>
        </template>
      </select>
    </label>
    <label v-if="cform.kind === 'comment'" class="field">貼文標題（選填）<input v-model="cform.postTitle" type="text" maxlength="120"></label>
    <label class="field">對方<input v-model="cform.author" type="text" maxlength="80" required placeholder="@username"></label>
    <label class="field">內容<textarea v-model="cform.text" rows="3" maxlength="2000" required /></label>
  </AppDialog>
</template>
