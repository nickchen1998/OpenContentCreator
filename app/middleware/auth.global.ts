export default defineNuxtRouteMiddleware(async (to) => {
  // 公開頁面不用登入
  // 公開頁面：各平台申請應用程式時要填的隱私權政策與服務條款
  if (to.path === '/privacy' || to.path === '/terms') return
  const { loggedIn, fetch: fetchSession, ready } = useUserSession()
  if (!ready.value) await fetchSession()
  if (!loggedIn.value && to.path !== '/login') return navigateTo('/login')
  if (loggedIn.value && to.path === '/login') return navigateTo('/')
})
