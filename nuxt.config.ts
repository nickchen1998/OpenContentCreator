// 架構同 TravelDiary：Nuxt 全端跑在 Cloudflare Workers，頁面是純前端渲染的 SPA，
// 只有 /api/* 與 /mcp 會進 Worker。
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  ssr: false,
  experimental: { noVueServer: true },

  nitro: {
    preset: 'cloudflare_module',
    cloudflare: {
      deployConfig: true,
      wrangler: {
        assets: {
          not_found_handling: 'single-page-application',
          // 新的 server route 要放在這些路徑底下，否則會被靜態資產接走
          run_worker_first: ['/api/*', '/mcp', '/mcp/*'],
        },
      },
    },
    prerender: { routes: ['/'] },
  },

  hooks: {
    // prerender（產生 SPA 外殼）在 Node 裡跑，認不得 `cloudflare:workers`，換成 Nitro 的 shim
    'nitro:init'(nitro) {
      nitro.hooks.hook('prerender:config', (config) => {
        config.alias = {
          ...config.alias,
          'cloudflare:workers': 'nitropack/presets/cloudflare/runtime/shims/workers.dev',
        }
        config.noExternals = true
      })
    },
  },

  modules: ['nuxt-auth-utils'],
  css: ['~/assets/css/main.css'],

  app: {
    head: {
      htmlAttrs: { lang: 'zh-Hant' },
      title: 'OpenContentCreator',
      meta: [
        { charset: 'UTF-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
        { name: 'robots', content: 'noindex, nofollow' },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&display=swap' },
      ],
    },
  },

  // 執行時由同名的 NUXT_* 環境變數覆蓋（Workers 上用 wrangler secret），不要寫 process.env
  runtimeConfig: {
    session: { maxAge: 60 * 60 * 24 * 30 },
    adminPassword: '',
  },
})
