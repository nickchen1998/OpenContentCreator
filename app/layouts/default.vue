<script setup lang="ts">
const pending = usePendingCount()
const { user, clear } = useUserSession()
const route = useRoute()
const loaded = ref(false)
const sidebarOpen = ref(false)
const userMenuOpen = ref(false)
const passwordOpen = ref(false)
const me = computed(() => user.value as { username?: string, isAdmin?: boolean } | null)

const sections = computed(() => [
  { label: 'Workspace', items: [
    { to: '/', en: 'Dashboard', zh: '儀表板' },
    { to: '/series', en: 'Series', zh: '系列文管理' },
    { to: '/threads', en: 'Threads', zh: '串文管理' },
    { to: '/schedule', en: 'Schedule', zh: '排程週曆' },
  ] },
  { label: 'Setup', items: [
    { to: '/accounts', en: 'Accounts', zh: '帳號與連結' },
    { to: '/connections', en: 'Connections', zh: 'MCP 連線與提案', badge: pending.value },
    ...(me.value?.isAdmin ? [{ to: '/members', en: 'Members', zh: '會員管理' }] : []),
  ] },
])
const isActive = (to: string) => (to === '/' ? route.path === '/' : route.path.startsWith(to) || (to === '/schedule' && route.path.startsWith('/posts')))
watch(() => route.fullPath, () => (sidebarOpen.value = false))

onMounted(async () => {
  await attempt(refreshBoot)
  loaded.value = true
})

async function logout() {
  await api('/api/auth/logout', { method: 'POST' })
  await clear()
  await navigateTo('/login')
}

// 改密碼
const pw = reactive({ current: '', next: '', again: '' })
const pwError = ref('')
function openPassword() {
  userMenuOpen.value = false
  Object.assign(pw, { current: '', next: '', again: '' })
  pwError.value = ''
  passwordOpen.value = true
}
async function savePassword() {
  if (pw.next !== pw.again) return (pwError.value = '兩次輸入的新密碼不一樣')
  try {
    await api('/api/auth/password', { method: 'POST', body: { current: pw.current, next: pw.next } })
    passwordOpen.value = false
    notify('密碼已更新')
  }
  catch (e: any) {
    pwError.value = e.message
  }
}
</script>

<template>
  <div>
    <div v-if="sidebarOpen" class="sidebar-backdrop" @click="sidebarOpen = false" />
    <aside class="sidebar" :class="{ open: sidebarOpen }">
      <NuxtLink to="/" class="sidebar-logo">
        <span class="sidebar-logo-block"><img src="/logo.png" alt="" width="28" height="28"></span>
        <span class="sidebar-logo-text">
          <span class="sidebar-logo-title">OpenContentCreator</span>
          <span class="sidebar-logo-sub">PLAN · POST · REPLY</span>
        </span>
      </NuxtLink>
      <div class="sidebar-scroll">
        <nav class="sidebar-nav" aria-label="主選單">
          <template v-for="section in sections" :key="section.label">
            <p class="nav-section-label">{{ section.label }}</p>
            <NuxtLink v-for="item in section.items" :key="item.to" :to="item.to" class="nav-item" :class="{ active: isActive(item.to) }" :aria-current="isActive(item.to) ? 'page' : undefined">
              <span class="nav-item-en">{{ item.en }}<span v-if="'badge' in item && item.badge" class="nav-badge">{{ item.badge }}</span></span>
              <span class="nav-item-zh">{{ item.zh }}</span>
            </NuxtLink>
          </template>
        </nav>
      </div>
      <div class="sidebar-user">
        <div v-if="userMenuOpen" class="user-backdrop" @click="userMenuOpen = false" />
        <div v-if="userMenuOpen" class="user-menu fade-in">
          <button class="user-menu-item" type="button" @click="openPassword">修改密碼</button>
          <div class="user-menu-divider" />
          <button class="user-menu-item logout" type="button" @click="logout">登出</button>
        </div>
        <button class="user-chip" type="button" :aria-expanded="userMenuOpen" @click="userMenuOpen = !userMenuOpen">
          <span class="user-avatar" aria-hidden="true">{{ me?.username?.[0] }}</span>
          <span class="user-meta">
            <span class="user-name">{{ me?.username }}</span>
            <span class="user-role">{{ me?.isAdmin ? '管理員' : '會員' }}</span>
          </span>
          <svg class="user-caret" :class="{ open: userMenuOpen }" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 15l6-6 6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
      </div>
    </aside>

    <div class="main">
      <header class="mobile-topbar">
        <button class="hamburger" type="button" aria-label="開啟選單" @click="sidebarOpen = !sidebarOpen">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
        </button>
        <NuxtLink to="/" class="mobile-brand"><img src="/logo.png" alt="" width="26" height="26">OpenContentCreator</NuxtLink>
      </header>
      <main class="content">
        <slot v-if="loaded" />
        <div v-else class="empty">載入中…</div>
      </main>
    </div>

    <AppDialog v-model="passwordOpen" title="修改密碼" :error="pwError" @submit="savePassword">
      <label class="field">目前的密碼<input v-model="pw.current" type="password" autocomplete="current-password" required></label>
      <label class="field">新密碼（至少 8 個字）<input v-model="pw.next" type="password" autocomplete="new-password" minlength="8" required></label>
      <label class="field">再輸入一次新密碼<input v-model="pw.again" type="password" autocomplete="new-password" minlength="8" required></label>
    </AppDialog>
  </div>
</template>
