<script setup lang="ts">
const boot = useBoot()
const pending = usePendingCount()
const { clear } = useUserSession()
const loaded = ref(false)

onMounted(async () => {
  await attempt(refreshBoot)
  loaded.value = true
})

async function logout() {
  await api('/api/auth/logout', { method: 'POST' })
  await clear()
  await navigateTo('/login')
}
</script>

<template>
  <div class="shell">
    <aside class="side">
      <div class="brand">OpenContentCreator</div>
      <nav aria-label="主選單">
        <NuxtLink to="/" :class="{ 'router-link-active': $route.path.startsWith('/posts') }">排程</NuxtLink>
        <NuxtLink to="/insights">成效</NuxtLink>
        <NuxtLink to="/replies">留言回覆</NuxtLink>
        <NuxtLink to="/connections">MCP 連線<span v-if="pending" class="tag" style="background: var(--primary); color: #fff">{{ pending }}</span></NuxtLink>
        <NuxtLink to="/groups">帳號群組</NuxtLink>
      </nav>
      <div class="groups">
        <div class="small muted" style="font-weight: 500">帳號群組</div>
        <template v-for="g in boot.groups" :key="g.id">
          <div class="bold" style="font-size: 14px">{{ g.name }}</div>
          <div class="small" style="color: var(--text-2)">{{ g.accounts.map(a => PLATFORMS[a.platform].label).join('、') || '還沒有帳號' }}</div>
        </template>
        <div v-if="loaded && !boot.groups.length" class="small muted">還沒有群組</div>
      </div>
      <button type="button" class="btn" style="margin-top: auto" @click="logout">登出</button>
    </aside>
    <main class="main">
      <slot v-if="loaded" />
      <div v-else class="empty">載入中…</div>
    </main>
  </div>
</template>
