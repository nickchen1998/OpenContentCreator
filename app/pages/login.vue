<script setup lang="ts">
definePageMeta({ layout: false })
const password = ref('')
const error = ref('')
const busy = ref(false)
const { fetch: fetchSession } = useUserSession()

async function submit() {
  busy.value = true
  error.value = ''
  try {
    await api('/api/auth/login', { method: 'POST', body: { password: password.value } })
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
    <form class="card" style="width: min(380px, 100%); padding: 28px; gap: 18px" @submit.prevent="submit">
      <div class="col" style="align-items: center; gap: 12px">
        <img src="/logo.png" alt="" width="72" height="72">
        <h1 style="font-size: 22px">OpenContentCreator</h1>
      </div>
      <label class="field">密碼
        <input v-model="password" type="password" autocomplete="current-password" required autofocus>
      </label>
      <div v-if="error" class="error" role="alert">{{ error }}</div>
      <button type="submit" class="btn primary" :disabled="busy">登入</button>
    </form>
  </div>
</template>
