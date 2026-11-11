export default defineNuxtRouteMiddleware(async (to) => {
  // 公開頁面不用登入
  if (to.path === '/privacy') return
  const { loggedIn, fetch: fetchSession, ready } = useUserSession()
  if (!ready.value) await fetchSession()
  if (!loggedIn.value && to.path !== '/login') return navigateTo('/login')
  if (loggedIn.value && to.path === '/login') return navigateTo('/')
})
