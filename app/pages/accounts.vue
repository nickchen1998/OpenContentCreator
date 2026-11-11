<script setup lang="ts">
const { accounts } = useLookup()
const error = ref('')
const connections = ref<ConnectionInfo[]>([])
const hook = ref<{ url: string, verifyToken: string }>()
async function loadConnections() {
  const data = await attempt(() => api<{ connections: ConnectionInfo[], hook: { url: string, verifyToken: string } }>('/api/connections'))
  if (data) {
    connections.value = data.connections
    hook.value = data.hook
  }
}
onMounted(loadConnections)
const connectionOf = (a: Account) => connections.value.find(c => c.accountId === a.id)
const connectOpen = ref(false)
const connectAccount = ref<Account>()
function openConnect(a: Account) {
  connectAccount.value = a
  connectOpen.value = true
}

const accountOpen = ref(false)
const editing = ref<Account>()
const form = reactive({ platform: 'instagram' as Platform, name: '' })
function openAccount(a?: Account) {
  editing.value = a
  error.value = ''
  Object.assign(form, { platform: a?.platform ?? 'instagram', name: a?.name ?? '' })
  accountOpen.value = true
}
async function saveAccount() {
  try {
    if (editing.value) await api(`/api/accounts/${editing.value.id}`, { method: 'PATCH', body: { name: form.name } })
    else await api('/api/accounts', { method: 'POST', body: { ...form } })
    accountOpen.value = false
    await refreshBoot()
  }
  catch (e: any) {
    error.value = e.message
  }
}
async function removeAccount() {
  const a = editing.value!
  if (!confirm(`移除 ${PLATFORMS[a.platform].label}「${a.name}」？這個帳號的連結、規則、留言紀錄與成效會一起刪除。`)) return
  if (await attempt(() => api(`/api/accounts/${a.id}`, { method: 'DELETE' }))) {
    accountOpen.value = false
    await Promise.all([refreshBoot(), loadConnections()])
  }
}
</script>

<template>
  <section class="card">
    <div class="row between">
      <h2>帳號</h2>
      <button type="button" class="btn primary" @click="openAccount()">新增帳號</button>
    </div>
    <div class="col divided" style="gap: 12px">
      <div v-for="a in accounts" :key="a.id" class="row between" style="gap: 12px">
        <div class="col">
          <span class="bold">{{ PLATFORMS[a.platform].label }}</span>
          <span class="small muted wrap-any">{{ a.name }}<template v-if="connectionOf(a) && connectionOf(a)!.externalName !== a.name">　·　{{ connectionOf(a)!.externalName }}</template></span>
        </div>
        <div class="row">
          <span v-if="connectionOf(a)" class="pill" :style="connectionOf(a)!.lastError ? 'background: var(--danger-bg); color: var(--danger)' : ''">{{ connectionOf(a)!.lastError ? '連結異常' : '已連結' }}</span>
          <button v-if="a.platform !== 'youtube'" type="button" class="btn sm" :class="{ outline: !connectionOf(a) }" :aria-label="`連結 ${PLATFORMS[a.platform].label} ${a.name}`" @click="openConnect(a)">{{ connectionOf(a) ? '連結設定' : '連結' }}</button>
          <button type="button" class="btn sm" :aria-label="`編輯 ${PLATFORMS[a.platform].label} ${a.name}`" @click="openAccount(a)">編輯</button>
        </div>
      </div>
    </div>
    <div v-if="!accounts.length" class="empty">還沒有帳號</div>
  </section>

  <AccountConnect v-model="connectOpen" :account="connectAccount" :connection="connectAccount && connectionOf(connectAccount)" :hook="hook" @changed="loadConnections" />
  <AppDialog v-model="accountOpen" :title="editing ? '編輯帳號' : '新增帳號'" :error="error" @submit="saveAccount">
    <label class="field">平台
      <select v-model="form.platform" :disabled="!!editing"><option v-for="k in PLATFORM_KEYS" :key="k" :value="k">{{ PLATFORMS[k].label }}</option></select>
    </label>
    <label class="field">{{ PLATFORMS[form.platform].unit }}名稱<input v-model="form.name" type="text" maxlength="60" required></label>
    <template v-if="editing" #actions>
      <button type="button" class="btn danger" style="margin-right: auto" @click="removeAccount">移除帳號</button>
    </template>
  </AppDialog>
</template>
