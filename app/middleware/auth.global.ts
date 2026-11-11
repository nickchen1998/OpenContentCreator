export default defineNuxtRouteMiddleware(async (to) => {
  // 不用登入的頁面：隱私權政策與服務條款（各平台申請應用程式時要填），以及會員對外的公開頁面（/p/<代號>）
  if (to.path === '/privacy' || to.path === '/terms' || to.path.startsWith('/p/')) return
  const { loggedIn, fetch: fetchSession, ready } = useUserSession()
  if (!ready.value) await fetchSession()
  if (!loggedIn.value && to.path !== '/login') return navigateTo('/login')
  if (loggedIn.value && to.path === '/login') return navigateTo('/')
})
