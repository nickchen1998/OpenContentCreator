// 排程（wrangler.jsonc 的 triggers.crons）。兩種頻率共用這個入口，用 cron 字串分辨：
// - 每 5 分鐘：輪詢 Threads 的新回覆
// - 每 30 分鐘：同步成效、換新快到期的 token
// 每一輪都只處理少量（Free 方案每次 50 個對外請求、50 個 D1 查詢），靠輪替把全部帳號走完。
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('cloudflare:scheduled' as any, async ({ controller }: { controller: { cron: string } }) => {
    try {
      if (controller.cron.startsWith('*/5')) {
        await pollThreads()
      }
      else {
        await syncStaleTargets()
        await refreshExpiringTokens()
      }
    }
    catch (error) {
      console.error('scheduled task failed', controller.cron, error)
    }
  })
})
