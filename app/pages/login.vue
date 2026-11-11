<script setup lang="ts">
definePageMeta({ layout: false })
const username = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)
const { fetch: fetchSession } = useUserSession()

async function submit() {
  busy.value = true
  error.value = ''
  try {
    await api('/api/auth/login', { method: 'POST', body: { username: username.value, password: password.value } })
    await fetchSession()
    await navigateTo('/')
  }
  catch (e: any) {
    error.value = e.message
  }
  busy.value = false
}
</script>

<template>
  <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px">
    <form class="card fade-in" style="width: min(400px, 100%); padding: 32px 30px; gap: 16px" @submit.prevent="submit">
      <div class="col" style="align-items: center; gap: 10px; margin-bottom: 4px">
        <img src="/logo.png" alt="" width="64" height="64">
        <p class="en-label">Plan · Post · Reply</p>
        <h1 style="font-size: 22px">OpenContentCreator</h1>
      </div>
      <label class="field">帳號
        <input v-model="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required autofocus>
      </label>
      <label class="field">密碼
        <input v-model="password" type="password" autocomplete="current-password" required>
      </label>
      <div v-if="error" class="error" role="alert">{{ error }}</div>
      <button type="submit" class="btn primary" :disabled="busy">登入</button>
      <p class="small muted" style="text-align: center">帳號由管理員建立，沒有開放註冊。</p>
    </form>
  </div>
</template>
