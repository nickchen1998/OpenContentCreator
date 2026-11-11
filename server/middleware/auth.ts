// 整個系統只有一個使用者：/api 底下除了登入與 session 以外都要先登入。/mcp 自己驗專案 token。
export default defineEventHandler(async (event) => {
  const path = event.path.split('?')[0]!
  if (!path.startsWith('/api/') || path.startsWith('/api/auth/') || path.startsWith('/api/_auth/')) return
  await requireUserSession(event)
})
