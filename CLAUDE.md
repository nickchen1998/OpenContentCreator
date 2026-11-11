# OpenContentCreator 開發指南

產品名稱一律寫 **OpenContentCreator**，不要用中文名稱。功能與架構總覽見 README.md。

## 部署與資料的規則

- 正式環境是 Cloudflare Worker `opencontentcreator`（網域 opencontentcreator.codeworldbagel.com）。
  `wrangler deploy`、`wrangler d1 migrations apply DB --remote`、改 secret 都等於動正式環境，**先問使用者**。
- **不要把任何金鑰寫進會 commit 的檔案，測試用的也不行。** 正式的值在 `wrangler secret`，
  本機副本在被 gitignore 的 `.env.production`。
- `nuxt.config.ts` 的 runtimeConfig 不要寫 `process.env.X`，那會在建置時把值寫進 bundle。

## 會員與資料隔離（最重要）

- 每個會員的資料互相獨立，直接用 `owner_id` 歸屬：`accounts`、`posts`、`projects`、`collections`（系列文）。
  其他表經由這幾張表歸屬到會員（`comments`／`connections`／`account_posts` → `accounts`；`post_targets`／`assets` → `posts`）。
- **沒有「帳號群組」這個概念**（使用者覺得難懂，2026-11-11 連資料表一起移除）。不要再加回任何把帳號分組的中間層；
  要把貼文歸類看成效用的是「系列」（`collections`）。
- **新的端點一定要限定在登入的會員身上**：`uidOf(event)` 取會員 id；帳號／專案的 id 要在 `loadBoot(uid)` 裡才算數；
  以 id 存取其他資料用 `server/utils/owned.ts` 的 `ownedPost` / `ownedAsset` / `ownedTarget` / `ownedComment` /
  `ownedAccount`。別人的資料一律回 404。`loadBoot` 回傳的 `OwnedBoot.ownerId` 用來在查詢裡限定會員。
- `projects.owner_id` 是較早加的欄位，沒有 cascade，刪會員要走 `deleteUserData`；其他表刪會員時會自動跟著刪。
- 管理員功能用 `requireAdmin(event)`。沒有開放註冊，也不做 OAuth（使用者的決定）。
- 改了這一帶之後，用兩個本機帳號互打一次 API 確認擋得住。

## 介面

- 設計語言比照 TuSoul（`../TuSoul/web/app/assets/css/`）：米白底淡格線、白卡片大圓角、深綠漸層側欄、
  膠囊按鈕、英文小標（`.en-label`）。token 與共用 class 都在 `app/assets/css/main.css`，不用 UI 框架。
- 字級（2026-11-11 使用者覺得太小、對小螢幕不友善，整站放大一級）：內文 16、頁標題 24/800、區塊標題 18/700、輔助文字 14、
  英文小標 12、按鈕 15／14、表格 14.5、標籤 13、圖表 13。**最小不低於 12**，新的樣式不要再用 13 以下的字放內容。
- **每一頁都要在一個畫面內看完，不讓視窗捲動**（桌機 ≥1024×640；更小的螢幕才退回一般捲動）：內容多的區塊在卡片內捲動並分頁。
  用 `main.css` 的 `.fill`（吃掉剩餘高度）、`.shrink`、`.scroll`、`.fit-grid.cols-2`／`.cols-3-2`、`.fit-col`；圖表用 `BarChart` 的 `fill`。
  放不下的次要內容收進 `AppDialog` 或分頁籤，不要往下加長頁面。改完在 1380×860 與 1380×700 各看一次。
- 平台一律用 `<PlatformIcon>` 顯示商標（路徑在 `shared/utils/platformIcons.ts`，取自 Simple Icons、CC0）：空間小只放圖示，
  需要文字時加 `label`。不要再用「FB／IG」文字膠囊。
- **畫面上不放說明文字，也不放頁面標題與副標**（側欄已經標出所在位置）：使用者看到就該知道怎麼用。
  需要解釋的東西放 `/guide`。不要用藍色當主色或 logo 底色。

## 系列文是中心

- 回覆設定跟著系列文走（`collections` 表，介面與 API 叫 series）：沒有獨立的「規則」頁，也沒有對全部帳號生效的規則
  （2026-11-11 使用者決定整合，`reply_rules` 表已刪）。不要再做回獨立的規則管理。
- 一則貼文只能屬於一個系列文（`collection_posts.post_id` 唯一）。留言進來時用（帳號, 平台貼文 id）找到 `account_posts`
  → 系列文 → 依設定回覆；貼文不在系列裡時**只記錄、不自動回**（給貼文管理頁用，`server/utils/replies.ts`）。
- **系列文沒有「啟用」開關**：「回覆留言」與「私訊留言者」兩個輸入框各自有填才做、留空就不做（可以只私訊不回留言）；
  兩個都沒填就只記錄留言。`collections.enabled` 是舊欄位，一律是 true，不要再加回 checkbox。
- 同步時會補抓系列文裡各貼文的既有留言（`importSeriesComments`）：**只記錄、不自動送出**，命中的標成待送出，由會員決定要不要回。
  不要改成自動送出，否則把一篇已有大量留言的貼文加進系列文會一口氣對所有人回覆加私訊。
- **「立即同步」有三處**：系列文成效頁一顆（`syncSeries`：只同步這個系列文裡的貼文，一次最多 8 則、最久沒更新的優先）、儀表板一顆（`syncAll`：貼文與成效數字＋Threads 最新幾則的整串對話），以及貼文管理每則貼文各一顆
  （只同步那一則的成效數字與留言；舊貼文排程輪不到，由使用者手動補，這是使用者選的做法）。貼文管理頁面上方不要再放整頁的同步按鈕。
- **儀表板是「今天的工作清單」**：最上面的數字**只有一行五格**（使用者要求，不要再加）：待回覆的對話（可以點過去）＋觀看、互動率、留言、私訊送出；
  送出失敗與連結異常平常不顯示，有狀況才在上方那一列出現紅色膠囊。數字是跟前一個期間比較的（比的是「那段期間發的貼文」的累計，`/api/insights` 會回兩倍期間的貼文）、表現最好的貼文
  （跟同帳號的平均比）、發文時段熱度圖（貼文少於 8 則不顯示）。
- **粉絲數**（YouTube 是訂閱數）：平台只給現值，所以每個帳號每天記一筆在 `account_stats`（`recordFollowers`，同步時順便抓，今天記過就不再打平台）。
  顯示在儀表板「各帳號」表格（含所選期間的增減）與帳號頁；**不放最上面那一行**。增減是「現在 − 期間開始那天或更早的紀錄」，
  紀錄不夠久就是 null、畫面顯示不出增減，不要用內插或估算補。
- **系列文成效頁**：最上面是轉換漏斗（觀看 → 留言 → 符合條件 → 已回覆 → 私訊送出），下面三欄：左邊是目前的回覆設定、各平台比較；
  中間是圖表／資料表；右邊是分頁「留言紀錄／待回覆／名單」（名單是拿到私訊的人，可下載 CSV）。
  不要另外做「沒符合條件的留言」區塊（使用者覺得多餘，用右邊的「待回覆」分頁處理）。
- **對話細節**（`ConversationList`）：只有三顆按鈕——「← 全部對話」「不用回」「送出」；後兩顆處理完會自動跳到下一串待回覆，沒有了就回卡片清單。
  不要加回「上一串／下一串」或跨貼文的待回覆佇列（使用者拒絕）。輸入框上方的常用回覆來自所屬系列文的回覆句＋最常手動回的幾句
  （`/api/comments/quick`），沒有另外的設定畫面。卡片清單裡待回覆的排最前面。
- **頁面會自動更新**：`useAutoRefresh`（儀表板、系列文清單與成效頁、貼文管理）每 30 秒打一次 `/api/changes` 拿指紋，有變才重新載入，
  分頁在背景時暫停。不做 SSE：Worker 的請求之間沒辦法互相通知，要真推送得加 Durable Object（使用者同意先用輪詢）。
  新增會影響畫面的資料時，記得讓 `/api/changes` 的指紋跟著變。
- 圖表用 Chart.js，包在 `app/components/BarChart.vue`（只註冊長條圖用到的部分）。互動組成的四個顏色用 dataviz 的
  `validate_palette` 驗過色盲辨識度，順序固定；不要用雙軸，數值尺度不同就拆成兩張圖。系列文成效頁的橫條圖最多畫 8 條：
  貼文更多時只畫觀看最高的 7 則，其餘合併成「其他 N 則」（每一則的數字在資料表）；標籤是平台縮寫＋日期＋開頭幾個字。每組圖表下面留一個「資料表」。
- **留言紀錄是「對話」**：`comments.parent_external_id` 記它回覆哪一則、`comments.mine` 記是不是帳號自己發的（送出的回覆、在平台上自己回的、
  Threads 的子文；status 一律是 `own`，**算留言數時要排除**）。`shared/utils/conversations.ts` 的 `groupConversations` 把紀錄組成對話與子文串，
  網頁（`ConversationList`：卡片 → 在同一個區塊內展開整串，貼文管理與系列文成效頁共用，不開新頁）與伺服器共用。
  對話最後一句是對方說的就是「待回覆」。**對話裡的後續回覆（回覆的回覆）只記錄、不自動回**，否則會跟人來回洗版；
  Threads 回在子文底下的留言算第一層，照系列文設定自動回。手動回覆走 `/api/comments/[id]/reply`，同一則可以回不只一次。
- 留言紀錄用 `comments.collection_id` 歸屬系列文，顯示在系列成效頁。`comments.rule_id`／`rule_name`／`kind` 是舊欄位。
- 側欄順序：Dashboard、Series、Posts（貼文管理）、Schedule｜Accounts、Connections、Members。系列文清單的卡片整張可點、不放按鈕也不放狀態標籤，
  點進去就是成效頁（一個系列文只有一頁）。新增與設定共用 `SeriesDialog`（畫面中間的視窗），貼文清單在區塊內捲動並分頁。

## 平台串接

- **只做一種情境：有人留言 → 回覆留言 ＋ 私訊他指定的內容。不做私訊自動回覆**（使用者明確拒絕），不訂閱、不處理 `messages`
  事件。資料庫裡的 `comments.kind` 欄位是先前留下的，一律是 `comment`，不要再接回私訊自動回覆。

- **Meta 由會員自備 App 與 token**（使用者的決定）：不要做「我們自己的 Meta App + OAuth」。
- **YouTube 走 Google OAuth，用戶端由站方在 GCP 申請、全站共用**（`NUXT_YOUTUBE_CLIENT_ID`／`NUXT_YOUTUBE_CLIENT_SECRET`，正式的值在 `wrangler secret`）。
  帳號頁按「連結」→ `/api/youtube/connect` 帶去 Google 同意畫面 → `/api/youtube/callback` 存下 refresh token（放在 `connections.token_enc`）。
  API 在 `server/utils/youtube.ts`；`LinkedPlatform` = Meta 三個＋YouTube，共用的流程（`deliver`、`replyToComment`、`fetchMetrics`、`syncAccountPosts`、
  `importThreadConversations`）裡用平台分支。一支影片當成一則貼文，留言沒有即時通知，跟 Threads 一起輪詢（每輪 4 支）；沒有私訊。
  **額度是整個站每天 10,000 單位**：讀取 1 單位、回一則留言 50 單位，新增會打 YouTube 的功能前先算額度。
  OAuth 同意畫面要是「實際運作中」，「測試中」的授權 7 天就失效。還沒用真的頻道驗證過，只對著假 API 測過。
- 公開頁面（不用登入）：`/privacy`、`/terms`，給 Meta 與 Google 申請應用程式時填。
- 進來：Instagram／Facebook 走 webhook（`server/api/hooks/meta/[key].ts`，網址裡的 key 對到會員，再用該帳號的 app secret
  驗簽章）；Threads 的 webhook 要過 App Review，改用排程輪詢（`pollThreads`）。都匯到 `server/utils/inbound.ts` 的 `receive`。
- **貼文管理（`/feed`）**：各平台已同步的貼文，不管有沒有放進系列文（原本是 Threads 專用的「串文管理」，2026-11-11 使用者決定升級成全平台）。
  上方只有平台分頁與篩選、不放統計數字（使用者要求移除，統計看儀表板），左邊貼文清單、右邊那則貼文的對話卡片與手動回覆；Threads 的子文串只在 Threads 貼文出現。
  **所有平台不在系列文裡的留言都會記錄**（未回覆、不自動回，由會員手動回或按「不用回」）；自動回覆仍然只跟著系列文，
  不要加「所有貼文都自動回」的帳號層級規則。貼文歸在哪個系列文只在左邊的貼文清單顯示，**不提供設定**、右邊也不重複顯示；
  要改到系列文管理去改。貼文管理的對話卡片沒有「只看待回覆」的篩選（使用者要求移除）；系列文成效頁則是用右側的「待回覆」分頁。
  點開貼文會立刻抓那一則的留言（`/api/feed/[id]/refresh`）：Threads 是整串對話，Instagram／Facebook 是第一層留言（回覆的回覆靠 webhook 即時進來）。
- Threads 輪詢用 conversation 端點一次拿整串（含回覆的回覆、自己的回覆、子文；讀不到會退回只看第一層），會輪到所有已同步的貼文（最新 2 則每輪都看，其餘名額系列文與非系列文各半輪流，`pickForPoll`）；連結之前的舊回覆只記錄、不自動送出。回覆是先建 container 再發布，
  太快發布會回「The requested resource does not exist」，`replyToComment` 會等幾秒重試。
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
- 排程每次只處理少量再輪替（Free 方案每次 50 個對外請求、50 個 D1 查詢）；不要在迴圈裡每筆查一次 D1。
- 本機觸發排程：`wrangler dev --test-scheduled` 後打 `/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*`。

## 寫程式時要知道的

- 新的 server route 要放在 `/api/*` 或 `/mcp` 底下，否則會被靜態資產接走。頁面路徑不能叫 `/mcp`。
- `/api/*` 由 `server/middleware/auth.ts` 統一要求登入（`/api/auth/login` 與 `/api/hooks/*` 除外），每個請求重新查一次會員；`/mcp` 自己驗專案 token。
- **安全性（2026-11-11 掃描後補的）**：session 的 `secure.pv` 是密碼版本，middleware 每個請求比對，改密碼／重設密碼後舊的登入全部失效；
  登入時帳號不存在也會做一次假的密碼運算（不洩漏帳號存不存在），並順手清掉一天前的失敗紀錄；靜態頁面的安全標頭在 `public/_headers`
  （外殼有內嵌腳本，不能限制 script-src）；匯出 CSV 時外人寫的內容要防公式（`=`、`+`、`-`、`@` 開頭補單引號）；
  轉址回頁面時只帶固定代碼、不帶任意文字。已知未修：PBKDF2 次數偏低（受 Free 方案 CPU 限制）、登入鎖定以帳號為單位。
- 密碼雜湊是 PBKDF2 20,000 次（Free 方案的 CPU 上限），`server/utils/passwords.ts` 與 `scripts/set-user.mjs` 要用同一種格式。
- drizzle-kit 在非互動環境遇到「是改名還是新增」會直接失敗：一次 migration 不要同時刪表又加表。真的避不開時用 pty 代答
  （第一個選項是「新增」），產出的 snapshot 可以留、**SQL 要自己重寫**。
- **要重建有子表的資料表時（SQLite 不能 DROP 有外鍵的欄位），不要用 drizzle-kit 產生的 SQL**：D1 不能關掉外鍵檢查，
  `DROP TABLE` 會觸發子表的 ON DELETE CASCADE 把資料刪光。照 `0008_remove_groups.sql` 的做法：子表先備份到暫存表、
  一次只換一張表（子表指向的父表隨時都要存在）、換完用 `INSERT OR IGNORE` 還原。上正式環境前先 `wrangler d1 export`
  備份到 `.backups/`（已 gitignore），並在本機有資料的 D1 演練、比對每張表的筆數。
- **D1 一個 statement 最多 100 個參數，drizzle 的多列 insert 每一列會把資料表的全部欄位都帶上**（`comments` 有 20 欄）：
  一次最多 4 列，多批用 `batchWrites`。超過會整句失敗（「Failed query: insert into …」），本機資料少時測不出來。
- Workers Free 方案每個請求 10ms CPU、50 次 D1 查詢：多筆寫入用 `db.batch()`（`batchWrites`），
  共用資料用 `loadBoot()` 一趟讀完。
- 撞期判斷集中在 `server/utils/coordination.ts`，網頁與 MCP 共用；衝突是讀取時算的，不存進資料庫。
- Nitro 的 Cloudflare preset 會先把 request body 整個讀進記憶體，不能用 `request.body` 串流。
- `shared/utils` 與 `server/utils` 的匯出都是 auto-import。型別不要取跟 DOM 全域同名的名字（例如 `Comment`）。
- MCP 工具改了說明或參數之後，AI 服務要開新對話才拿得到新的工具清單。
- 改完跑：`pnpm build`、
  `pnpm dlx --package=typescript@5.9.3 tsc -p .nuxt/tsconfig.server.json --noEmit`、
  `pnpm dlx --package=typescript@5.9.3 --package=vue-tsc vue-tsc -p .nuxt/tsconfig.app.json --noEmit`。
