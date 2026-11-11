# OpenContentCreator

社群貼文的素材管理、排程協調與固定回覆。系統**不代發貼文**：它管的是發文計畫、素材、文案與成效，
發文由你手動完成。

正式環境：<https://opencontentcreator.codeworldbagel.com>

## 功能

| 頁面 | 內容 |
|---|---|
| 儀表板 `/` | 整體觀看與互動、自動回覆與私訊次數、各系列文與各帳號的數字 |
| 系列文管理 `/series` | 系列文清單；新增用視窗設定名稱、貼文、有人留言時的回覆與私訊 |
| 系列文 `/series/:id` | 單一系列文的成效：合計、圖表（各貼文觀看、互動組成、每日留言）、留言紀錄（可送出／重送）；設定用視窗 |
| 排程週曆 `/schedule` | 自己新增規劃，或確認各專案透過 MCP 送來的提案；撞期會標紅 |
| 貼文 `/posts/:id` | 素材上傳與下載（R2）、各平台文案、發文狀態 |
| 帳號 `/accounts` | 登記各平台的帳號、連結平台 API |
| MCP 連線 `/connections` | 提案佇列、專案與 token、協調規則 |
| 會員管理 `/members` | 管理員建立會員、重設密碼、刪除會員 |
| 設定教學 `/guide` | 各平台怎麼建立 Meta App、產生 token、設定 Webhook |

### 系列文

系列文是整個系統的中心：一組貼文（可以跨帳號、跨平台，通常是同一篇內容在各平台的版本），一起看成效、共用一套留言回覆設定。

- 一則貼文只能屬於一個系列文。
- 有人在系列裡的貼文留言 → 依該系列的設定公開回覆（多句輪流），可以同時私訊留言者。觸發條件是「任何留言」或「含關鍵字」。
- **不在任何系列文裡的貼文不會自動回覆**，留言也不留紀錄。
- 同步時會補抓系列文裡各貼文既有的留言，但只列為「待送出」，不會自動回覆。
- 防洗版：同一個人在同一則貼文只回一次；每個帳號每小時回覆有上限。

### MCP

端點是 `/mcp`（Streamable HTTP，無狀態）。每個專案有自己的 token，看得到所屬會員的帳號與排程，只能送提案：

```bash
claude mcp add --transport http opencontentcreator https://opencontentcreator.codeworldbagel.com/mcp --header "Authorization: Bearer <token>"
```

工具：`list_accounts`、`list_schedule`、`find_open_slots`、`check_conflicts`、`get_insights`、`propose_post`、`update_proposal`。

### 會員

帳號加密碼登入，沒有開放註冊、也沒有 OAuth。每個會員有自己的帳號、貼文、素材、專案與規則，
彼此看不到對方的資料；MCP token 屬於哪個會員，就只看得到那個會員的資料。

- 平常由管理員在「會員管理」頁建立帳號，密碼由系統產生、只顯示一次；會員登入後可以自己改密碼。
- 第一個管理員（或管理員忘記密碼）用指令：

  ```bash
  OCC_USER_PASSWORD='<密碼>' node scripts/set-user.mjs <帳號> --admin --remote
  ```

### 平台串接

會員用**自己的 Meta App** 產生 token 貼進來（只服務自己的帳號，不需要 Meta 的 App Review）。設定步驟在站內的 `/guide`。

| 平台 | 留言回覆 | 留言後私訊 | 成效同步 | 怎麼收到留言 |
|---|---|---|---|---|
| Instagram | ✓ | ✓ | ✓ | Webhook（即時） |
| Facebook 粉專 | ✓ | ✓ | ✓ | Webhook（即時） |
| Threads | ✓ | 平台不支援 | ✓ | 每 5 分鐘輪詢（Webhook 要過 App Review） |
| YouTube | 還沒做 | 平台不支援 | 還沒做 | — |

唯一的情境是「有人留言 → 回覆留言，並私訊他指定的內容」。**不做私訊自動回覆**，系統也不接收使用者傳來的私訊。

- token 與 app secret 用 `NUXT_TOKEN_KEY` 加密後才存進 D1。
- 成效不用貼連結：帳號連結後，排程每 30 分鐘輪流抓各帳號最近 25 則貼文與成效（`account_posts`），成效總覽頁也能按「立即同步」。
- 「Instagram 登入」與 Threads 的 token 60 天到期，排程會自動換新（統一登入與粉專的 token 不會到期）。
- Instagram 與 Facebook 粉專已用真的帳號實測；Threads 與成效同步還沒有（見 CLAUDE.md）。

### 還沒做的

- YouTube（等 GCP 的 OAuth client）。
- 素材單檔上限 60MB。

## 架構

跟 TravelDiary 同一套：Nuxt 4（`ssr: false` 的 SPA）+ Nitro `cloudflare_module`，整個跑在一個 Cloudflare Worker。

| Binding | 用途 |
|---|---|
| `DB`（D1） | 所有資料，schema 在 `server/database/schema.ts`（drizzle） |
| `MEDIA`（R2） | 素材內容，key 是 `assets/<postId>/<uuid>` |

頁面由靜態資產直接回應，只有 `/api/*` 與 `/mcp` 會進 Worker；另有兩個排程（每 5 分鐘、每 30 分鐘，`server/plugins/scheduled.ts`）（`nuxt.config.ts` 的 `run_worker_first`）。
時間一律是台北時間，存成 `YYYY-MM-DDTHH:MM`。

## 開發

```bash
pnpm install
pnpm db:migrate:local
pnpm build
OCC_USER_PASSWORD='<本機密碼>' node scripts/set-user.mjs <帳號> --admin
pnpm preview:worker --var NUXT_SESSION_PASSWORD:<32 字元以上>
```

在 workerd 上跑建置後的 Worker（http://localhost:3010），跟正式環境行為一致。

改 schema：`pnpm db:generate --name <名稱>` 產生 migration，不手寫。

## 部署

```bash
pnpm exec wrangler d1 migrations apply DB --remote   # 有 schema 變更時，先做
pnpm build && pnpm exec wrangler deploy
```

Secret 用 `wrangler secret put` 設定，不放進任何會 commit 的檔案：

- `NUXT_SESSION_PASSWORD`：session cookie 的加密密鑰
- `NUXT_TOKEN_KEY`：加密平台 token 的金鑰（換掉的話已連結的帳號都要重新連結）
