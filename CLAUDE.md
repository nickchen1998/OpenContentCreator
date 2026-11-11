# OpenContentCreator 開發指南

產品名稱一律寫 **OpenContentCreator**，不要用中文名稱。功能與架構總覽見 README.md。

## 部署與資料的規則

- 正式環境是 Cloudflare Worker `opencontentcreator`（網域 opencontentcreator.codeworldbagel.com）。
  `wrangler deploy`、`wrangler d1 migrations apply DB --remote`、改 secret 都等於動正式環境，**先問使用者**。
- **不要把任何金鑰寫進會 commit 的檔案，測試用的也不行。** 正式的值在 `wrangler secret`，
  本機副本在被 gitignore 的 `.env.production`。
- `nuxt.config.ts` 的 runtimeConfig 不要寫 `process.env.X`，那會在建置時把值寫進 bundle。

## 寫程式時要知道的

- 新的 server route 要放在 `/api/*` 或 `/mcp` 底下，否則會被靜態資產接走。頁面路徑不能叫 `/mcp`。
- `/api/*` 由 `server/middleware/auth.ts` 統一要求登入（`/api/auth/*` 除外）；`/mcp` 自己驗專案 token。
- Workers Free 方案每個請求 10ms CPU、50 次 D1 查詢：多筆寫入用 `db.batch()`（`batchWrites`），
  共用資料用 `loadBoot()` 一趟讀完。
- 撞期判斷集中在 `server/utils/coordination.ts`，網頁與 MCP 共用；衝突是讀取時算的，不存進資料庫。
- Nitro 的 Cloudflare preset 會先把 request body 整個讀進記憶體，不能用 `request.body` 串流。
- `shared/utils` 與 `server/utils` 的匯出都是 auto-import。型別不要取跟 DOM 全域同名的名字（例如 `Comment`）。
- MCP 工具改了說明或參數之後，AI 服務要開新對話才拿得到新的工具清單。
- 改完跑：`pnpm build`、
  `pnpm dlx --package=typescript@5.9.3 tsc -p .nuxt/tsconfig.server.json --noEmit`、
  `pnpm dlx --package=typescript@5.9.3 --package=vue-tsc vue-tsc -p .nuxt/tsconfig.app.json --noEmit`。
