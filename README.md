# OpenContentCreator

社群貼文的素材管理、排程協調與固定回覆。系統**不代發貼文**：它管的是發文計畫、素材、文案與成效，
發文由你手動完成。

正式環境：<https://opencontentcreator.codeworldbagel.com>

## 功能

| 頁面 | 內容 |
|---|---|
| 排程 `/` | 週曆。自己新增規劃，或確認各專案透過 MCP 送來的提案；撞期會標紅 |
| 貼文 `/posts/:id` | 素材上傳與下載（R2）、各平台文案、發文連結與成效登錄 |
| 成效 `/insights` | 依帳號、群組彙整已發出貼文的觀看與互動 |
| 留言回覆 `/replies` | 固定回覆規則（關鍵字／任何留言、多句輪替、防洗版）與留言紀錄 |
| MCP 連線 `/connections` | 提案佇列、專案與 token、協調規則 |
| 帳號群組 `/groups` | 群組與底下各平台的帳號 |
| 會員管理 `/members` | 管理員建立會員、重設密碼、刪除會員 |

### MCP

端點是 `/mcp`（Streamable HTTP，無狀態）。每個專案有自己的 token，只看得到被授權的群組，只能送提案：

```bash
claude mcp add --transport http opencontentcreator https://opencontentcreator.codeworldbagel.com/mcp --header "Authorization: Bearer <token>"
```

工具：`list_groups`、`list_schedule`、`find_open_slots`、`check_conflicts`、`get_insights`、`propose_post`、`update_proposal`。

### 會員

帳號加密碼登入，沒有開放註冊、也沒有 OAuth。每個會員有自己的群組、貼文、素材、專案與規則，
彼此看不到對方的資料；MCP token 屬於哪個會員，就只看得到那個會員的資料。

- 平常由管理員在「會員管理」頁建立帳號，密碼由系統產生、只顯示一次；會員登入後可以自己改密碼。
- 第一個管理員（或管理員忘記密碼）用指令：

  ```bash
  OCC_USER_PASSWORD='<密碼>' node scripts/set-user.mjs <帳號> --admin --remote
  ```

### 還沒做的

- **各平台 API 尚未串接**（Meta / YouTube 需要各自的開發者應用程式與審核）。所以：
  成效數字是手動登錄；留言是手動貼入，系統依規則挑好固定回覆，由你貼出去再標示已回覆。
  規則引擎在 `server/utils/replies.ts`，接上平台後直接呼叫 `processComment`。
- 素材單檔上限 60MB。

## 架構

跟 TravelDiary 同一套：Nuxt 4（`ssr: false` 的 SPA）+ Nitro `cloudflare_module`，整個跑在一個 Cloudflare Worker。

| Binding | 用途 |
|---|---|
| `DB`（D1） | 所有資料，schema 在 `server/database/schema.ts`（drizzle） |
| `MEDIA`（R2） | 素材內容，key 是 `assets/<postId>/<uuid>` |

頁面由靜態資產直接回應，只有 `/api/*` 與 `/mcp` 會進 Worker（`nuxt.config.ts` 的 `run_worker_first`）。
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
