<script setup lang="ts">
const boot = useBoot()
const { accountLabel, group, account } = useLookup()
const rules = ref<ReplyRule[]>([])
const comments = ref<CommentRow[]>([])
const selected = ref(0)
const error = ref('')

async function load() {
  const [r, c] = await Promise.all([attempt(() => api<ReplyRule[]>('/api/rules')), attempt(() => api<CommentRow[]>('/api/comments'))])
  rules.value = r ?? []
  comments.value = c ?? []
  if (!comments.value.some(x => x.id === selected.value)) selected.value = comments.value[0]?.id ?? 0
}
onMounted(load)
const sel = computed(() => comments.value.find(c => c.id === selected.value))

// 規則
const ruleOpen = ref(false)
const editing = ref<ReplyRule>()
const blank = () => ({ name: '', groupId: boot.value.groups[0]?.id ?? 0, accountId: null as number | null, matchType: 'keyword' as 'keyword' | 'any', keywords: '', action: 'reply' as 'reply' | 'reply_dm', repliesText: '', dmText: '', enabled: true })
const form = reactive(blank())
function openRule(rule?: ReplyRule) {
  editing.value = rule
  error.value = ''
  Object.assign(form, rule ? { ...rule, repliesText: rule.replies.join('\n') } : blank())
  ruleOpen.value = true
}
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
const scope = (r: ReplyRule) => [group(r.groupId)?.name, r.accountId ? PLATFORMS[account(r.accountId)?.platform ?? 'facebook'].label : null, r.postId ? '指定貼文' : '全部貼文'].filter(Boolean).join(' · ')

// 留言
const commentOpen = ref(false)
const cform = reactive({ accountId: 0, postTitle: '', author: '', text: '' })
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
async function removeComment() {
  if (!confirm('刪除這則留言紀錄？')) return
  if (await attempt(() => api(`/api/comments/${sel.value!.id}`, { method: 'DELETE' }))) await load()
}
async function copy(text: string) {
  await navigator.clipboard.writeText(text).catch(() => {})
  notify('已複製')
}
const STATE = { ready: '已選好回覆，待你貼出', sent: '已回覆', unmatched: '未處理', skipped: '命中但不回覆', handled: '已處理' }
const hit = (c: CommentRow) => c.ruleId != null || c.ruleName !== ''
</script>

<template>
  <div class="row between gap-lg">
    <div class="col" style="flex: 1 1 420px">
      <p class="en-label">Replies · 留言與固定回覆</p>
      <h1>留言與自動回覆</h1>
      <div class="lead">只有命中規則的留言會得到固定回覆，內容都是你事先寫好的句子。沒命中的留言不處理，留給你自己回。</div>
    </div>
    <button type="button" class="btn primary" :disabled="!boot.groups.length" @click="openRule()">新增規則</button>
  </div>

  <div class="card warn">
    <div class="note"><b>目前還沒有接上各平台的 API</b>，系統不會自己抓留言、也不會自己送出回覆。現在的用法：把留言貼進來，系統依規則挑好要回的那一句，你複製貼到平台上，再標示為已回覆。規則、輪替與防洗版的判斷都已經是正式邏輯，接上平台後會直接沿用。</div>
  </div>

  <section class="card" style="gap: 16px">
    <h2>回覆規則</h2>
    <div class="table-scroll">
      <table v-if="rules.length" style="min-width: 760px">
        <thead>
          <tr><th scope="col">規則</th><th scope="col">範圍</th><th scope="col">觸發條件</th><th scope="col">動作</th><th scope="col">固定回覆</th><th scope="col">狀態</th><th scope="col"><span class="small">操作</span></th></tr>
        </thead>
        <tbody>
          <tr v-for="r in rules" :key="r.id">
            <th scope="row">{{ r.name }}</th>
            <td>{{ scope(r) }}</td>
            <td>{{ r.matchType === 'any' ? '任何留言' : `留言含「${r.keywords}」` }}</td>
            <td>{{ r.action === 'reply_dm' ? '留言回覆＋私訊' : '留言回覆' }}</td>
            <td>{{ r.replies.length }} 句輪替</td>
            <td>{{ r.enabled ? '啟用中' : '已停用' }}</td>
            <td>
              <div class="row" style="flex-wrap: nowrap">
                <button type="button" class="btn" @click="toggle(r)">{{ r.enabled ? '停用' : '啟用' }}</button>
                <button type="button" class="btn" :aria-label="`編輯 ${r.name}`" @click="openRule(r)">編輯</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">還沒有規則。</div>
    </div>
    <div class="note">防洗版設定：同一位留言者在同一則貼文只回一次。每條規則準備多句輪替，避免整排一模一樣的回覆。每個帳號每小時回覆上限 {{ boot.rules.replyPerHour }} 則，超過就暫停到下個小時（上限可在「MCP 連線」的協調規則調整）。</div>
  </section>

  <div class="grid-2">
    <section class="card" style="padding: 12px; gap: 8px" aria-label="最近的留言">
      <div class="row between" style="margin: 4px 8px">
        <h2>最近的留言</h2>
        <button type="button" class="btn" :disabled="!boot.groups.some(g => g.accounts.length)" @click="openComment">貼入留言</button>
      </div>
      <button v-for="c in comments" :key="c.id" type="button" class="list-btn" :aria-pressed="c.id === selected" @click="selected = c.id">
        <span class="row between" style="flex-wrap: nowrap">
          <span class="small" style="color: var(--text-2)">{{ accountLabel(c.accountId) }} · {{ c.author }}</span>
          <span class="tag bold" :style="hit(c) ? 'background: var(--primary-bg); color: var(--primary)' : 'background: var(--chip); color: var(--text-2)'">{{ hit(c) ? '命中規則' : '未命中' }}</span>
        </span>
        <span class="wrap-any">{{ c.text }}</span>
        <span class="small muted">{{ STATE[c.status] }}</span>
      </button>
      <div v-if="!comments.length" class="empty">還沒有留言紀錄。</div>
    </section>

    <section v-if="sel" class="card" style="gap: 16px" aria-label="留言內容">
      <div class="col">
        <div class="small muted">{{ accountLabel(sel.accountId) }}<template v-if="sel.postTitle"> · 貼文「{{ sel.postTitle }}」</template></div>
        <div class="bold">{{ sel.author }}</div>
      </div>
      <div class="box wrap-any" style="font-size: 15px; line-height: 1.7; padding: 14px 16px">{{ sel.text }}</div>
      <div class="col" style="gap: 6px">
        <div class="small muted">規則與處理</div>
        <div style="line-height: 1.6">{{ sel.reason }}</div>
      </div>
      <div v-if="sel.replyText" class="col" style="gap: 6px">
        <div class="small muted">{{ sel.status === 'sent' ? '送出的固定回覆' : '要貼出的固定回覆' }}</div>
        <div class="row" style="flex-wrap: nowrap; align-items: stretch">
          <div class="grow wrap-any" style="line-height: 1.6; padding: 12px 14px; border-radius: 8px; border: 1px solid var(--line)">{{ sel.replyText }}</div>
          <button type="button" class="btn outline" @click="copy(sel.replyText)">複製</button>
        </div>
      </div>
      <div v-if="sel.dmText" class="col" style="gap: 6px">
        <div class="small muted">私訊內容</div>
        <div class="row" style="flex-wrap: nowrap; align-items: stretch">
          <div class="grow box pre" style="background: var(--card); border: 1px solid var(--line)">{{ sel.dmText }}</div>
          <button type="button" class="btn outline" @click="copy(sel.dmText)">複製</button>
        </div>
      </div>
      <div class="row">
        <button v-if="sel.status === 'ready'" type="button" class="btn primary" @click="mark('sent')">標示為已回覆</button>
        <button v-if="sel.status === 'unmatched' || sel.status === 'skipped'" type="button" class="btn" @click="mark('handled')">標示為已處理</button>
        <button type="button" class="btn danger" @click="removeComment">刪除紀錄</button>
      </div>
    </section>
  </div>

  <AppDialog v-model="ruleOpen" :title="editing ? '編輯規則' : '新增規則'" :error="error" @submit="saveRule">
    <label class="field">規則名稱<input v-model="form.name" type="text" maxlength="40" required></label>
    <div class="row" style="align-items: flex-end">
      <label class="field grow">群組
        <select v-model="form.groupId" @change="form.accountId = null">
          <option v-for="g in boot.groups" :key="g.id" :value="g.id">{{ g.name }}</option>
        </select>
      </label>
      <label class="field grow">帳號
        <select v-model="form.accountId">
          <option :value="null">群組內全部帳號</option>
          <option v-for="a in group(form.groupId)?.accounts" :key="a.id" :value="a.id">{{ PLATFORMS[a.platform].label }}・{{ a.name }}</option>
        </select>
      </label>
    </div>
    <div class="row" style="align-items: flex-end">
      <label class="field grow">觸發條件
        <select v-model="form.matchType"><option value="keyword">留言含關鍵字</option><option value="any">任何留言</option></select>
      </label>
      <label v-if="form.matchType === 'keyword'" class="field grow">關鍵字（多個用逗號分隔）
        <input v-model="form.keywords" type="text" maxlength="200" required>
      </label>
    </div>
    <label class="field">固定回覆（一行一句，會輪替使用）
      <textarea v-model="form.repliesText" rows="4" required />
    </label>
    <label class="field">動作
      <select v-model="form.action"><option value="reply">留言回覆</option><option value="reply_dm">留言回覆＋私訊</option></select>
    </label>
    <label v-if="form.action === 'reply_dm'" class="field">私訊內容
      <textarea v-model="form.dmText" rows="3" maxlength="1000" required />
    </label>
    <template v-if="editing" #actions>
      <button type="button" class="btn danger" style="margin-right: auto" @click="removeRule">刪除規則</button>
    </template>
  </AppDialog>

  <AppDialog v-model="commentOpen" title="貼入留言" submit-label="套用規則" :error="error" @submit="saveComment">
    <label class="field">帳號
      <select v-model="cform.accountId">
        <template v-for="g in boot.groups" :key="g.id">
          <option v-for="a in g.accounts" :key="a.id" :value="a.id">{{ g.name }} · {{ PLATFORMS[a.platform].label }}・{{ a.name }}</option>
        </template>
      </select>
    </label>
    <label class="field">貼文標題（選填，用來判斷同一則貼文是否已回過）<input v-model="cform.postTitle" type="text" maxlength="120"></label>
    <label class="field">留言者<input v-model="cform.author" type="text" maxlength="80" required placeholder="@username"></label>
    <label class="field">留言內容<textarea v-model="cform.text" rows="3" maxlength="2000" required /></label>
  </AppDialog>
</template>
