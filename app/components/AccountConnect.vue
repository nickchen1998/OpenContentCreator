<script setup lang="ts">
// 連結一個帳號到平台 API：貼上自己 Meta App 的 token（Instagram／Facebook 另外要 app secret 與 webhook 設定）
const open = defineModel<boolean>({ required: true })
const props = defineProps<{ account?: Account, connection?: ConnectionInfo, hook?: { url: string, verifyToken: string } }>()
const emit = defineEmits<{ changed: [] }>()
const form = reactive({ token: '', appSecret: '' })
const error = ref('')
const warning = ref('')
const busy = ref(false)
const needsWebhook = computed(() => props.account?.platform === 'instagram' || props.account?.platform === 'facebook')

watch(open, (value) => {
  if (!value) return
  Object.assign(form, { token: '', appSecret: '' })
  error.value = ''
  warning.value = ''
})

async function save() {
  busy.value = true
  error.value = ''
  try {
    const result = await api<{ externalName: string, subscribeError: string }>(`/api/accounts/${props.account!.id}/connection`, { method: 'PUT', body: { ...form } })
    emit('changed')
    if (result.subscribeError) {
      warning.value = `已連結 ${result.externalName}，但訂閱 Webhook 失敗：${result.subscribeError}`
    }
    else {
      open.value = false
      notify(props.connection ? '已更新' : `已連結 ${result.externalName}`)
    }
  }
  catch (e: any) {
    error.value = e.message
  }
  busy.value = false
}
async function toggleAuto() {
  if (await attempt(() => api(`/api/accounts/${props.account!.id}/connection`, { method: 'PATCH', body: { autoSend: !props.connection!.autoSend } }))) emit('changed')
}
async function disconnect() {
  if (!confirm('中斷連結？自動回覆與成效同步會停止。')) return
  if (await attempt(() => api(`/api/accounts/${props.account!.id}/connection`, { method: 'DELETE' }), '已中斷連結')) {
    emit('changed')
    open.value = false
  }
}
async function copy(text: string) {
  await navigator.clipboard.writeText(text).catch(() => {})
  notify('已複製')
}
</script>

<template>
  <AppDialog v-model="open" :title="account ? `連結 ${PLATFORMS[account.platform].label}` : ''" :submit-label="connection ? '更新' : '連結'" :error="error" :busy="busy" @submit="save">
    <template v-if="account">
      <div v-if="connection" class="row between box">
        <span><span class="pill">已連結</span>　{{ connection.externalName }}</span>
        <label class="check"><input type="checkbox" :checked="connection.autoSend" @change="toggleAuto">自動送出回覆</label>
      </div>
      <div v-if="connection?.lastError" class="error" role="alert">{{ connection.lastError }}</div>
      <div v-if="warning" class="error" role="alert">{{ warning }}</div>

      <label class="field">Access token
        <textarea v-model="form.token" rows="3" autocomplete="off" spellcheck="false" :required="!connection" :placeholder="connection ? '留空 = 不更換' : ''" style="font-family: ui-monospace, Menlo, monospace; font-size: 13px" />
      </label>
      <label v-if="needsWebhook" class="field">{{ account.platform === 'instagram' ? 'Instagram 應用程式密鑰' : '應用程式密鑰（App secret）' }}
        <input v-model="form.appSecret" type="password" autocomplete="off" required>
      </label>

      <template v-if="needsWebhook && hook">
        <div class="col" style="gap: 6px">
          <span class="small bold">Webhook 回呼網址</span>
          <div class="row" style="flex-wrap: nowrap"><code class="box grow wrap-any">{{ hook.url }}</code><button type="button" class="btn sm" @click="copy(hook.url)">複製</button></div>
        </div>
        <div class="col" style="gap: 6px">
          <span class="small bold">驗證權杖</span>
          <div class="row" style="flex-wrap: nowrap"><code class="box grow wrap-any">{{ hook.verifyToken }}</code><button type="button" class="btn sm" @click="copy(hook.verifyToken)">複製</button></div>
        </div>
      </template>
      <NuxtLink :to="`/guide#${account.platform}`" target="_blank" class="small">設定教學</NuxtLink>
    </template>
    <template v-if="connection" #actions>
      <button type="button" class="btn danger" style="margin-right: auto" @click="disconnect">中斷連結</button>
    </template>
  </AppDialog>
</template>
