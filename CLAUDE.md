# OpenContentCreator 開發指南

產品名稱一律寫 **OpenContentCreator**，不要用中文名稱。功能與架構總覽見 README.md。

## 部署與資料的規則

- 正式環境是 Cloudflare Worker `opencontentcreator`（網域 opencontentcreator.codeworldbagel.com）。
  `wrangler deploy`、`wrangler d1 migrations apply DB --remote`、改 secret 都等於動正式環境，**先問使用者**。
- **不要把任何金鑰寫進會 commit 的檔案，測試用的也不行。** 正式的值在 `wrangler secret`，
  本機副本在被 gitignore 的 `.env.production`。
- `nuxt.config.ts` 的 runtimeConfig 不要寫 `process.env.X`，那會在建置時把值寫進 bundle。

## 會員與資料隔離（最重要）

- 每個會員的資料互相獨立，直接用 `owner_id` 歸屬：`accounts`、`posts`、`reply_rules`、`projects`、`collections`。
  其他表經由這幾張表歸屬到會員（`comments`／`connections`／`account_posts` → `accounts`；`post_targets`／`assets` → `posts`）。
- **沒有「帳號群組」這個概念**（使用者覺得難懂，2026-11-11 連資料表一起移除）。不要再加回任何把帳號分組的中間層；
  要把貼文歸類看成效用的是「系列」（`collections`）。
- **新的端點一定要限定在登入的會員身上**：`uidOf(event)` 取會員 id；帳號／專案的 id 要在 `loadBoot(uid)` 裡才算數；
  以 id 存取其他資料用 `server/utils/owned.ts` 的 `ownedPost` / `ownedAsset` / `ownedTarget` / `ownedRule` / `ownedComment` /
  `ownedAccount`。別人的資料一律回 404。`loadBoot` 回傳的 `OwnedBoot.ownerId` 用來在查詢裡限定會員。
- `projects.owner_id` 是較早加的欄位，沒有 cascade，刪會員要走 `deleteUserData`；其他表刪會員時會自動跟著刪。
- 管理員功能用 `requireAdmin(event)`。沒有開放註冊，也不做 OAuth（使用者的決定）。
- 改了這一帶之後，用兩個本機帳號互打一次 API 確認擋得住。

## 介面

- 設計語言比照 TuSoul（`../TuSoul/web/app/assets/css/`）：米白底淡格線、白卡片大圓角、深綠漸層側欄、
  膠囊按鈕、英文小標（`.en-label`）。token 與共用 class 都在 `app/assets/css/main.css`，不用 UI 框架。
- 字級：內文 15、頁標題 24/800、區塊標題 17/700、輔助文字 13、英文小標 11、按鈕 14／13、表格 13.5。
- **畫面上不放說明文字，也不放頁面標題與副標**（側欄已經標出所在位置）：使用者看到就該知道怎麼用。
  需要解釋的東西放 `/guide`。不要用藍色當主色或 logo 底色。

## 平台串接

- **只做一種情境：有人留言 → 回覆留言 ＋ 私訊他指定的內容。不做私訊自動回覆**（使用者明確拒絕），不訂閱、不處理 `messages`
  事件。資料庫裡的 `reply_rules.channel`、`comments.kind` 欄位是先前留下的，一律是 `comment`，不要再接回私訊規則。

- **Meta 由會員自備 App 與 token**（使用者的決定）：不要做「我們自己的 Meta App + OAuth」。YouTube 之後由站方在 GCP 申請。
- 進來：Instagram／Facebook 走 webhook（`server/api/hooks/meta/[key].ts`，網址裡的 key 對到會員，再用該帳號的 app secret
  驗簽章）；Threads 的 webhook 要過 App Review，改用排程輪詢（`pollThreads`）。都匯到 `server/utils/inbound.ts` 的 `receive`。
- 出去：`deliver`（留言回覆、private reply、回私訊）。Graph API 都在 `server/utils/meta.ts`。
- **實測狀態（2026-11-11）**：Instagram（統一登入）已用真的帳號驗證：連結、收留言 webhook、回覆留言、留言後私訊都通，
  不送審的 App 也收得到一般人的留言。**Instagram 的 webhook 是用「Instagram 應用程式密鑰」簽的，不是 Meta App 的 app secret**
  （用錯會全部 403「簽章不符」）。Facebook 粉專也已實測：連結（用戶權杖換 Page token）、收留言、回覆留言、留言後私訊都通，webhook 用的是 Meta App 的 app secret；
  **Meta App 一定要「發佈」上線，粉專的事件才會送過來**（未發佈時連 App 管理員自己的留言都不送；Instagram 不受此限）。
  「指定貼文」的規則也實測過（兩則貼文各自私訊不同內容）。一般粉絲（沒有 App 角色）的粉專留言收不收得到還沒確認。Threads、成效同步還只對著本機的假 Graph API
  （`NUXT_META_API_BASE`）測過，第一次接真帳號時要核對，尤其是 Facebook 的觀看數指標。
- webhook 被擋時會 `console.warn('meta hook rejected', …)` 記下原因（沒有對應的連結／簽章不符），用 `wrangler tail` 看。
- Instagram 有兩種設定：2026 起新建的 Meta App 只有「統一登入（Unified Login）」（EAA 開頭的系統用戶權杖、graph.facebook.com、
  要連結商家資產管理組合、帳號從 `/me/assigned_instagram_accounts` 找）；舊 App 才有「Instagram 登入」（IG 開頭、graph.instagram.com）。
  `server/utils/meta.ts` 用 token 開頭分辨，兩種都支援。
- Facebook 粉專：Meta 後台 Messenger 頁的「產生」只給私訊權限（連粉專基本資料都讀不到），所以連結時收的是「圖形 API 測試工具」
  產生的用戶權杖 + app id + app secret，由 `pageTokenFromUserToken` 換成不會到期的 Page token。直接貼 Page token 也還是收。
- 成效來自 `account_posts`（`syncAccountPosts` 自動匯入帳號最近的貼文），**跟排程裡的 posts 沒有關聯**；使用者不要手動貼連結
  或登錄數字的做法。列表那一趟就有按讚與留言數，觀看／分享／收藏要逐則打 insights，所以每次只替最久沒更新的幾則抓。
- 規則的「指定貼文」存的是平台上的貼文 id（`reply_rules.external_post_id`），不是我們自己的 posts.id。
- 排程每次只處理少量再輪替（Free 方案每次 50 個對外請求、50 個 D1 查詢）；不要在迴圈裡每筆查一次 D1。
- 本機觸發排程：`wrangler dev --test-scheduled` 後打 `/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*`。

## 寫程式時要知道的

- 新的 server route 要放在 `/api/*` 或 `/mcp` 底下，否則會被靜態資產接走。頁面路徑不能叫 `/mcp`。
- `/api/*` 由 `server/middleware/auth.ts` 統一要求登入（`/api/auth/login` 與 `/api/hooks/*` 除外），每個請求重新查一次會員；`/mcp` 自己驗專案 token。
- 密碼雜湊是 PBKDF2 20,000 次（Free 方案的 CPU 上限），`server/utils/passwords.ts` 與 `scripts/set-user.mjs` 要用同一種格式。
- drizzle-kit 在非互動環境遇到「是改名還是新增」會直接失敗：一次 migration 不要同時刪表又加表。真的避不開時用 pty 代答
  （第一個選項是「新增」），產出的 snapshot 可以留、**SQL 要自己重寫**。
- **要重建有子表的資料表時（SQLite 不能 DROP 有外鍵的欄位），不要用 drizzle-kit 產生的 SQL**：D1 不能關掉外鍵檢查，
  `DROP TABLE` 會觸發子表的 ON DELETE CASCADE 把資料刪光。照 `0008_remove_groups.sql` 的做法：子表先備份到暫存表、
  一次只換一張表（子表指向的父表隨時都要存在）、換完用 `INSERT OR IGNORE` 還原。上正式環境前先 `wrangler d1 export`
  備份到 `.backups/`（已 gitignore），並在本機有資料的 D1 演練、比對每張表的筆數。
- Workers Free 方案每個請求 10ms CPU、50 次 D1 查詢：多筆寫入用 `db.batch()`（`batchWrites`），
  共用資料用 `loadBoot()` 一趟讀完。
- 撞期判斷集中在 `server/utils/coordination.ts`，網頁與 MCP 共用；衝突是讀取時算的，不存進資料庫。
- Nitro 的 Cloudflare preset 會先把 request body 整個讀進記憶體，不能用 `request.body` 串流。
- `shared/utils` 與 `server/utils` 的匯出都是 auto-import。型別不要取跟 DOM 全域同名的名字（例如 `Comment`）。
- MCP 工具改了說明或參數之後，AI 服務要開新對話才拿得到新的工具清單。
- 改完跑：`pnpm build`、
  `pnpm dlx --package=typescript@5.9.3 tsc -p .nuxt/tsconfig.server.json --noEmit`、
  `pnpm dlx --package=typescript@5.9.3 --package=vue-tsc vue-tsc -p .nuxt/tsconfig.app.json --noEmit`。
