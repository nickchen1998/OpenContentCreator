<script setup lang="ts">
const boot = useBoot()
const { projectStyle, account } = useLookup()
type Proposal = Post & { suggestions: string[] }
const proposals = ref<Proposal[]>([])
const error = ref('')
const toolsOpen = ref(false)
const endpoint = `${location.origin}/mcp`

async function load() {
  proposals.value = await attempt(() => api<Proposal[]>('/api/posts', { query: { status: 'pending' } })) ?? []
  usePendingCount().value = proposals.value.length
}
onMounted(load)

async function decide(p: Proposal, body: Record<string, unknown>, done: string) {
  if (await attempt(() => api(`/api/posts/${p.id}`, { method: 'PATCH', body }), done)) await load()
}
// 自選時間
const timeOpen = ref(false)
const timeFor = ref<Proposal>()
const time = reactive({ day: '', time: '' })
function pickTime(p: Proposal) {
  timeFor.value = p
  error.value = ''
  Object.assign(time, { day: p.scheduledAt.slice(0, 10), time: p.scheduledAt.slice(11) })
  timeOpen.value = true
}
async function saveTime() {
  try {
    await api(`/api/posts/${timeFor.value!.id}`, { method: 'PATCH', body: { action: 'approve', scheduledAt: `${time.day}T${time.time}` } })
    timeOpen.value = false
    notify('已排入')
    await load()
  }
  catch (e: any) {
    error.value = e.message
  }
}

// 專案
const projectOpen = ref(false)
const editing = ref<Project>()
const pform = reactive({ name: '', color: 'blue' as ProjectColor, priority: 1, canReadInsights: true })
const newToken = ref('')
const tokenOpen = ref(false)
function openProject(p?: Project) {
  editing.value = p
  error.value = ''
  pform.name = p?.name ?? ''
  pform.color = p?.color ?? (Object.keys(PROJECT_COLORS) as ProjectColor[])[boot.value.projects.length % Object.keys(PROJECT_COLORS).length]!
  pform.priority = p?.priority ?? 1
  pform.canReadInsights = p?.canReadInsights ?? true
  projectOpen.value = true
}
async function saveProject() {
  error.value = ''
  const settings = { priority: pform.priority, canReadInsights: pform.canReadInsights }
  try {
    if (editing.value) {
      await api(`/api/projects/${editing.value.id}`, { method: 'PATCH', body: { name: pform.name, color: pform.color, ...settings } })
    }
    else {
      const { token } = await api<{ token: string }>('/api/projects', { method: 'POST', body: { name: pform.name, color: pform.color, ...settings } })
      showToken(token)
    }
    projectOpen.value = false
    await refreshBoot()
  }
  catch (e: any) {
    error.value = e.message
  }
}
function showToken(token: string) {
  newToken.value = token
  tokenOpen.value = true
}
async function regenerate() {
  if (!confirm(`重新產生「${editing.value!.name}」的 token？舊的會立刻失效。`)) return
  const result = await attempt(() => api<{ token: string }>(`/api/projects/${editing.value!.id}/token`, { method: 'POST' }))
  if (result) {
    projectOpen.value = false
    showToken(result.token)
    await refreshBoot()
  }
}
async function removeProject() {
  if (!confirm(`刪除專案「${editing.value!.name}」？它的 token 會立刻失效，已送出的貼文會保留。`)) return
  if (await attempt(() => api(`/api/projects/${editing.value!.id}`, { method: 'DELETE' }))) {
    projectOpen.value = false
    await Promise.all([refreshBoot(), load()])
  }
}
const command = computed(() => `claude mcp add --transport http opencontentcreator ${endpoint} --header "Authorization: Bearer ${newToken.value}"`)
async function copy(text: string) {
  await navigator.clipboard.writeText(text).catch(() => {})
  notify('已複製')
}

// 協調規則
const rulesOpen = ref(false)
const rform = reactive({ minGapHours: 3, maxPerDay: 2, replyPerHour: 20 })
function openRules() {
  error.value = ''
  Object.assign(rform, boot.value.rules)
  rulesOpen.value = true
}
async function saveRules() {
  try {
    await api('/api/settings', { method: 'PUT', body: { ...rform } })
    rulesOpen.value = false
    await Promise.all([refreshBoot(), load()])
  }
  catch (e: any) {
    error.value = e.message
  }
}

const TOOLS = [
  ['list_accounts', '列出這個專案可以使用的帳號', '唯讀'],
  ['list_schedule', '查詢指定期間所有專案的排程與提案', '唯讀'],
  ['find_open_slots', '依協調規則找出某些帳號的可用時段', '唯讀'],
  ['check_conflicts', '送出前先檢查某時段是否撞期', '唯讀'],
  ['get_insights', '讀取帳號或貼文的成效摘要，用來決定發文時段', '唯讀'],
  ['get_follower_growth', '每成長一定數量的粉絲花了幾天、期間發了哪些貼文', '唯讀'],
  ['compare_follower_periods', '比較幾段自訂期間的粉絲增減與貼文', '唯讀'],
  ['propose_post', '指定帳號送出貼文提案（可附文案），進入待確認佇列', '寫入（需確認）'],
  ['update_proposal', '修改或撤回自己專案尚未確認的提案', '寫入（需確認）'],
]
</script>

<template>
  <div class="fit-grid cols-3-2 fill">
  <section class="card">
    <div class="row between">
      <h2>提案佇列</h2>
      <div class="muted">{{ proposals.length }} 則待處理</div>
    </div>
    <div class="col divided fill scroll" style="gap: 14px">
      <div v-for="p in proposals" :key="p.id" class="row between gap-lg">
        <div class="col" style="flex: 1 1 360px; gap: 6px">
          <div class="row">
            <span class="tag lg" :style="projectStyle(p.projectId)">{{ boot.projects.find(x => x.id === p.projectId)?.name ?? '已刪除的專案' }}</span>
            <span class="small bold" :style="p.conflicts.length ? 'color: var(--danger)' : 'color: var(--ok)'">{{ p.conflicts.length ? '時段衝突' : '符合規則' }}</span>
          </div>
          <NuxtLink :to="`/posts/${p.id}`" class="bold" style="font-size: 16px; color: var(--ink)">{{ p.title }}</NuxtLink>
          <div class="small pf-row" style="color: var(--text-2)"><span v-for="t in p.targets" :key="t.id" class="pf"><PlatformIcon :platform="account(t.accountId)?.platform" :size="14" />{{ account(t.accountId)?.name ?? '已刪除的帳號' }}</span>{{ fmtAt(p.scheduledAt) }}</div>
          <div v-for="c in p.conflicts" :key="c" class="note">{{ c }}</div>
          <div v-if="p.note" class="note muted">備註：{{ p.note }}</div>
        </div>
        <div class="row">
          <template v-if="p.conflicts.length">
            <button v-for="s in p.suggestions" :key="s" type="button" class="btn outline" @click="decide(p, { action: 'approve', scheduledAt: s }, '已改時間並排入')">改到 {{ fmtAt(s) }}</button>
            <button type="button" class="btn" @click="decide(p, { action: 'approve' }, '已排入')">照原時間排入</button>
          </template>
          <button v-else type="button" class="btn primary" @click="decide(p, { action: 'approve' }, '已排入')">排入</button>
          <button type="button" class="btn" @click="pickTime(p)">自選時間</button>
          <button type="button" class="btn" @click="decide(p, { action: 'reject' }, '已退回')">退回</button>
        </div>
      </div>
    </div>
    <div v-if="!proposals.length" class="empty">沒有待處理的提案</div>
  </section>

  <div class="fit-col">
    <section class="card shrink">
      <h2>已連線的專案</h2>
      <div class="col divided scroll" style="gap: 14px">
        <div v-for="p in boot.projects" :key="p.id" class="row between" style="gap: 12px">
          <div class="col grow">
            <div class="row"><span class="tag lg" :style="projectStyle(p.id)">{{ p.name }}</span><code class="muted">{{ p.tokenPrefix }}</code></div>
            <div class="small" style="color: var(--text-2)">優先序 {{ p.priority }}｜讀排程、{{ p.canReadInsights ? '讀成效、' : '' }}送提案</div>
          </div>
          <button type="button" class="btn" :aria-label="`編輯 ${p.name}`" @click="openProject(p)">編輯</button>
        </div>
      </div>
      <div v-if="!boot.projects.length" class="empty">還沒有專案</div>
      <div class="col" style="gap: 8px; border-top: 1px solid var(--line); padding-top: 14px">
        <div class="small muted">MCP 端點</div>
        <div class="row"><code class="box grow wrap-any">{{ endpoint }}</code><button type="button" class="btn" @click="copy(endpoint)">複製</button></div>
        <button type="button" class="btn primary" style="align-self: flex-start" @click="openProject()">新增專案並產生 token</button>
      </div>
    </section>
    <section class="card">
      <h2>協調規則</h2>
      <div class="col divided" style="gap: 12px">
        <div class="row between"><span>同帳號兩則貼文的間隔</span><b>{{ boot.rules.minGapHours }} 小時</b></div>
        <div class="row between"><span>每個帳號每天最多</span><b>{{ boot.rules.maxPerDay }} 則</b></div>
        <div class="row between"><span>每個帳號每小時自動回覆上限</span><b>{{ boot.rules.replyPerHour }} 則</b></div>
      </div>
      <div class="row">
        <button type="button" class="btn" @click="openRules">編輯規則</button>
        <button type="button" class="btn" @click="toolsOpen = true">專案可用的工具</button>
      </div>
    </section>
  </div>
  </div>

  <AppDialog v-model="toolsOpen" wide title="專案可用的工具" submit-label="">
    <div class="table-scroll">
      <table style="min-width: 640px">
        <thead><tr><th scope="col">工具</th><th scope="col">用途</th><th scope="col">類型</th></tr></thead>
        <tbody>
          <tr v-for="t in TOOLS" :key="t[0]"><th scope="row"><code>{{ t[0] }}</code></th><td>{{ t[1] }}</td><td style="white-space: nowrap">{{ t[2] }}</td></tr>
        </tbody>
      </table>
    </div>
  </AppDialog>

  <AppDialog v-model="timeOpen" title="自選時間並排入" submit-label="排入" :error="error" @submit="saveTime">
    <div class="note">{{ timeFor?.title }}</div>
    <div class="row" style="align-items: flex-end">
      <label class="field grow">日期<input v-model="time.day" type="date" required></label>
      <label class="field grow">時間（台北）<input v-model="time.time" type="time" required></label>
    </div>
  </AppDialog>

  <AppDialog v-model="projectOpen" :title="editing ? '編輯專案' : '新增專案'" :submit-label="editing ? '儲存' : '建立並產生 token'" :error="error" @submit="saveProject">
    <div class="row" style="align-items: flex-end">
      <label class="field grow">專案名稱<input v-model="pform.name" type="text" maxlength="40" required></label>
      <label class="field">標籤顏色
        <select v-model="pform.color"><option v-for="(c, key) in PROJECT_COLORS" :key="key" :value="key">{{ c.label }}</option></select>
      </label>
    </div>
    <div class="row" style="align-items: flex-end">
      <label class="field" style="width: 120px">優先序<input v-model.number="pform.priority" type="number" min="1" max="99" required></label>
      <label class="check"><input v-model="pform.canReadInsights" type="checkbox">可讀成效</label>
    </div>
    <template v-if="editing" #actions>
      <button type="button" class="btn danger" @click="removeProject">刪除</button>
      <button type="button" class="btn" style="margin-right: auto" @click="regenerate">重新產生 token</button>
    </template>
  </AppDialog>

  <AppDialog v-model="tokenOpen" title="專案的 MCP token" submit-label="" :error="''">
    <div class="note bold">只會顯示這一次</div>
    <div class="row"><code class="box grow wrap-any">{{ newToken }}</code><button type="button" class="btn" @click="copy(newToken)">複製</button></div>
    <div class="small muted">在專案資料夾執行</div>
    <div class="row"><code class="box grow wrap-any">{{ command }}</code><button type="button" class="btn" @click="copy(command)">複製</button></div>
  </AppDialog>

  <AppDialog v-model="rulesOpen" title="編輯協調規則" :error="error" @submit="saveRules">
    <label class="field">同帳號兩則貼文的間隔（小時，0 = 不限）<input v-model.number="rform.minGapHours" type="number" min="0" max="72" required></label>
    <label class="field">每個帳號每天最多幾則（0 = 不限）<input v-model.number="rform.maxPerDay" type="number" min="0" max="50" required></label>
    <label class="field">每個帳號每小時自動回覆上限（0 = 不限）<input v-model.number="rform.replyPerHour" type="number" min="0" max="1000" required></label>
  </AppDialog>
</template>
