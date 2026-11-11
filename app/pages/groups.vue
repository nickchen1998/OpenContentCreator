<script setup lang="ts">
const boot = useBoot()
const { projectStyle } = useLookup()
const rules = ref<ReplyRule[]>([])
const error = ref('')
onMounted(async () => (rules.value = await attempt(() => api<ReplyRule[]>('/api/rules')) ?? []))

const groupOpen = ref(false)
const editing = ref<Group>()
const gform = reactive({ name: '', topic: '' })
function openGroup(g?: Group) {
  editing.value = g
  error.value = ''
  Object.assign(gform, { name: g?.name ?? '', topic: g?.topic ?? '' })
  groupOpen.value = true
}
async function saveGroup() {
  try {
    await api(editing.value ? `/api/groups/${editing.value.id}` : '/api/groups', { method: editing.value ? 'PATCH' : 'POST', body: { ...gform } })
    groupOpen.value = false
    await refreshBoot()
  }
  catch (e: any) {
    error.value = e.message
  }
}
async function removeGroup() {
  if (!confirm(`刪除群組「${editing.value!.name}」？底下的帳號、貼文、素材與回覆規則都會一起刪除，無法復原。`)) return
  if (await attempt(() => api(`/api/groups/${editing.value!.id}`, { method: 'DELETE' }))) {
    groupOpen.value = false
    await refreshBoot()
  }
}

const accountOpen = ref(false)
const accountGroup = ref<Group>()
const editingAccount = ref<Account>()
const aform = reactive({ platform: 'instagram' as Platform, name: '' })
function openAccount(g: Group, a?: Account) {
  accountGroup.value = g
  editingAccount.value = a
  error.value = ''
  Object.assign(aform, { platform: a?.platform ?? 'instagram', name: a?.name ?? '' })
  accountOpen.value = true
}
async function saveAccount() {
  try {
    if (editingAccount.value) await api(`/api/accounts/${editingAccount.value.id}`, { method: 'PATCH', body: { name: aform.name } })
    else await api('/api/accounts', { method: 'POST', body: { groupId: accountGroup.value!.id, ...aform } })
    accountOpen.value = false
    await refreshBoot()
  }
  catch (e: any) {
    error.value = e.message
  }
}
async function removeAccount() {
  const a = editingAccount.value!
  if (!confirm(`移除 ${PLATFORMS[a.platform].label}「${a.name}」？這個帳號在各貼文裡的文案與成效會一起刪除。`)) return
  if (await attempt(() => api(`/api/accounts/${a.id}`, { method: 'DELETE' }))) {
    accountOpen.value = false
    await refreshBoot()
  }
}
const projectsOf = (g: Group) => boot.value.projects
  .flatMap(p => p.grants.filter(x => x.groupId === g.id).map(x => ({ id: p.id, name: p.name, priority: x.priority })))
  .sort((a, b) => a.priority - b.priority)
</script>

<template>
  <div class="row between gap-lg">
    <div class="col" style="flex: 1 1 420px">
      <p class="en-label">Groups · 帳號群組</p>
      <h1>帳號群組</h1>
      <div class="lead">一個群組是一組同主題的帳號。排程、成效、回覆規則與 MCP 授權都以群組為單位；同一個平台可以在不同群組各放一個帳號。</div>
    </div>
    <button type="button" class="btn primary" @click="openGroup()">新增群組</button>
  </div>

  <div class="grid-2">
    <section v-for="g in boot.groups" :key="g.id" class="card" style="padding: 24px; gap: 18px">
      <div class="col">
        <h2 style="font-size: 19px; font-weight: 800">{{ g.name }}</h2>
        <div v-if="g.topic" class="muted" style="font-size: 14px">主題：{{ g.topic }}</div>
      </div>
      <div class="col" style="gap: 8px">
        <div class="small muted">帳號</div>
        <div v-for="a in g.accounts" :key="a.id" class="row between" style="border-top: 1px solid var(--line); padding-top: 10px; gap: 12px">
          <span style="font-weight: 500">{{ PLATFORMS[a.platform].label }}</span>
          <span class="row"><span class="wrap-any">{{ a.name }}</span><button type="button" class="btn sm" :aria-label="`編輯 ${PLATFORMS[a.platform].label} ${a.name}`" @click="openAccount(g, a)">編輯</button></span>
        </div>
        <div v-if="!g.accounts.length" class="small muted">還沒有帳號</div>
      </div>
      <div class="col" style="gap: 8px">
        <div class="small muted">可以提案的專案（依優先序）</div>
        <div class="row">
          <span v-for="p in projectsOf(g)" :key="p.id" class="tag lg" :style="projectStyle(p.id)">{{ p.priority }} {{ p.name }}</span>
          <span v-if="!projectsOf(g).length" class="small muted">還沒有專案被授權，到「MCP 連線」新增</span>
        </div>
      </div>
      <div class="col" style="gap: 6px">
        <div class="small muted">自動回覆規則</div>
        <div>{{ rules.filter(r => r.groupId === g.id).map(r => r.name).join('、') || '無' }}</div>
      </div>
      <div class="row">
        <button type="button" class="btn" @click="openGroup(g)">編輯群組</button>
        <button type="button" class="btn" @click="openAccount(g)">新增帳號</button>
      </div>
    </section>
  </div>
  <div v-if="!boot.groups.length" class="card empty">還沒有群組。先建立一個群組（例如「出遊」），再把這個主題的各平台帳號加進去。</div>

  <section class="card" style="gap: 10px">
    <h2>群組怎麼影響其他功能</h2>
    <div class="note" style="line-height: 1.9">排程：撞期與間隔以單一帳號計算，不同群組的同平台帳號互不影響。<br>成效：各帳號分開列，並依群組合併。<br>留言回覆：固定回覆規則掛在群組或群組內的單一帳號上。<br>MCP：專案的 token 綁定群組，連進來只看得到該群組的排程與成效。</div>
  </section>

  <AppDialog v-model="groupOpen" :title="editing ? '編輯群組' : '新增群組'" :error="error" @submit="saveGroup">
    <label class="field">群組名稱<input v-model="gform.name" type="text" maxlength="40" required></label>
    <label class="field">主題（選填）<input v-model="gform.topic" type="text" maxlength="100" placeholder="例如：旅遊與美食"></label>
    <template v-if="editing" #actions>
      <button type="button" class="btn danger" style="margin-right: auto" @click="removeGroup">刪除群組</button>
    </template>
  </AppDialog>
  <AppDialog v-model="accountOpen" :title="editingAccount ? '編輯帳號' : `在「${accountGroup?.name}」新增帳號`" :error="error" @submit="saveAccount">
    <label class="field">平台
      <select v-model="aform.platform" :disabled="!!editingAccount"><option v-for="k in PLATFORM_KEYS" :key="k" :value="k">{{ PLATFORMS[k].label }}</option></select>
    </label>
    <label class="field">{{ PLATFORMS[aform.platform].unit }}名稱<input v-model="aform.name" type="text" maxlength="60" required></label>
    <div class="note">這裡只是登記帳號名稱，用來排程與歸類；系統不會登入或代管你的社群帳號。</div>
    <template v-if="editingAccount" #actions>
      <button type="button" class="btn danger" style="margin-right: auto" @click="removeAccount">移除帳號</button>
    </template>
  </AppDialog>
</template>
