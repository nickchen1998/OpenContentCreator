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
onMounted(async () => {
  await loadConnections()
  // 從 Google 的同意畫面回來時，結果是網址上的代碼（?youtube=ok 等）。只認得這幾個代碼，其他的一律不顯示，
  // 免得有人做一個連結讓你看到他指定的文字
  const messages: Record<string, string> = {
    ok: 'YouTube 已連結',
    denied: 'YouTube 連結失敗：你沒有同意授權',
    google: 'YouTube 連結失敗：Google 沒有完成授權，請再試一次',
    invalid: 'YouTube 連結失敗：連結的請求無效，請再試一次',
    expired: 'YouTube 連結失敗：連結的請求過期了，請再試一次',
    account: 'YouTube 連結失敗：找不到要連結的帳號',
    notconfigured: 'YouTube 連結失敗：站方還沒有設定 YouTube 的連線資訊',
    nochannel: 'YouTube 連結失敗：這個 Google 帳號沒有 YouTube 頻道',
    norefresh: 'YouTube 連結失敗：請到 Google 帳號的「第三方應用程式存取權」移除這個應用程式後再連結一次',
    failed: 'YouTube 連結失敗，請再試一次',
  }
  const result = useRoute().query.youtube
  if (typeof result === 'string' && result) {
    if (messages[result]) notify(messages[result])
    await navigateTo('/accounts', { replace: true })
  }
})
// YouTube 不用貼權杖：直接帶去 Google 的同意畫面，同意後會回到這一頁
const connectYoutube = (a: Account) => { window.location.href = `/api/youtube/connect?accountId=${a.id}` }
async function disconnect(a: Account) {
  if (!confirm(`中斷 ${PLATFORMS[a.platform].label}「${a.name}」的連結？之後不會再同步這個帳號，也不會回覆留言。`)) return
  if (await attempt(() => api(`/api/accounts/${a.id}/connection`, { method: 'DELETE' }), '已中斷連結')) await loadConnections()
}
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
  <section class="card shrink">
    <div class="row between">
      <h2>帳號</h2>
      <button type="button" class="btn primary" @click="openAccount()">新增帳號</button>
    </div>
    <div class="col divided scroll" style="gap: 12px">
      <div v-for="a in accounts" :key="a.id" class="row between" style="gap: 12px">
        <div class="col">
          <PlatformIcon class="bold" :platform="a.platform" label />
          <span class="small muted wrap-any">{{ a.name }}<template v-if="connectionOf(a) && connectionOf(a)!.externalName !== a.name">　·　{{ connectionOf(a)!.externalName }}</template></span>
        </div>
        <div class="row">
          <span v-if="connectionOf(a)" class="pill" :style="connectionOf(a)!.lastError ? 'background: var(--danger-bg); color: var(--danger)' : ''">{{ connectionOf(a)!.lastError ? '連結異常' : '已連結' }}</span>
          <template v-if="a.platform === 'youtube'">
            <button type="button" class="btn sm" :class="{ outline: !connectionOf(a) }" :aria-label="`連結 YouTube ${a.name}`" @click="connectYoutube(a)">{{ connectionOf(a) ? '重新連結' : '連結' }}</button>
            <button v-if="connectionOf(a)" type="button" class="btn sm" :aria-label="`中斷 YouTube ${a.name} 的連結`" @click="disconnect(a)">中斷連結</button>
          </template>
          <button v-else type="button" class="btn sm" :class="{ outline: !connectionOf(a) }" :aria-label="`連結 ${PLATFORMS[a.platform].label} ${a.name}`" @click="openConnect(a)">{{ connectionOf(a) ? '連結設定' : '連結' }}</button>
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
