export default defineNuxtRouteMiddleware(async (to) => {
  const { loggedIn, fetch: fetchSession, ready } = useUserSession()
  if (!ready.value) await fetchSession()
  if (!loggedIn.value && to.path !== '/login') return navigateTo('/login')
  if (loggedIn.value && to.path === '/login') return navigateTo('/')
})
