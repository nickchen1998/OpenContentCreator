<script setup lang="ts">
// 系列文的成效：合計、系列裡每則貼文、留言紀錄
const id = Number(useRoute().params.id)
const { account } = useLookup()
const series = ref<Series>()
const comments = ref<CommentRow[]>([])
const missing = ref(false)
const settingsOpen = ref(false)
const syncing = ref(false)
// 只同步這個系列文裡的貼文（成效數字與留言）。一次最多 8 則，貼文更多時會提示再按一次
async function sync() {
  syncing.value = true
  const r = await attempt(() => api<{ synced: number, total: number, errors: string[] }>(`/api/series/${id}/sync`, { method: 'POST' }))
  syncing.value = false
  if (!r) return
  notify(r.errors.length ? r.errors.join('；') : r.total > r.synced ? `已同步 ${r.synced}／${r.total} 則，再按一次繼續` : '已同步')
  await load(true)
}
const backToList = () => navigateTo('/series')

async function load(quiet = false) {
  try {
    const data = await api<{ series: Series, comments: CommentRow[] }>(`/api/series/${id}`)
    series.value = data.series
    comments.value = data.comments
  }
  catch {
    // 自動更新時遇到暫時的錯誤就維持原本的畫面，不要變成「找不到」
    if (!quiet) missing.value = true
  }
}
onMounted(() => load())
useAutoRefresh(() => load(true))

const totals = computed(() => totalsOf(series.value?.posts ?? []))
const rate = (eng: number, views: number) => (views ? `${(eng / views * 100).toFixed(1)}%` : '—')
const dayOf = (iso: string) => fmtDay(minutesToAt(Math.floor(Date.parse(iso) / 60000) + 480).slice(0, 10))
// 成效統計的圖表資料
const SERIES_GREEN = '#3e5346'
// 互動組成的四個顏色經過色盲辨識度檢查（dataviz 的 validate_palette），順序固定不要調換
const PARTS = [
  { key: 'likes', label: '按讚', color: '#1baf7a' },
  { key: 'comments', label: '留言', color: '#eb6834' },
  { key: 'shares', label: '分享', color: '#6250d6' },
  { key: 'saves', label: '收藏', color: '#eda100' },
] as const
// 每則貼文的名稱：平台縮寫＋日期＋開頭幾個字。同一天同平台發好幾則時，光靠平台和日期分不出來
const labelOf = (p: InsightPost) => {
  const platform = account(p.accountId)?.platform
  const head = p.text.replace(/\s+/g, ' ').trim()
  return `${platform ? PLATFORMS[platform].short : ''} ${dayOf(p.publishedAt)}${head ? ` ${head.length > 7 ? `${head.slice(0, 7)}…` : head}` : ''}`.trim()
}
const postLabels = computed(() => (series.value?.posts ?? []).map(labelOf))
// 圖表最多畫 CHART_ROWS 條：貼文更多時只畫觀看最高的幾則，其餘合併成一條「其他」（每一則的數字在資料表）
const CHART_ROWS = 8
const chartRows = computed(() => {
  const list = [...(series.value?.posts ?? [])].sort((a, b) => b.views - a.views || engagementOf(b) - engagementOf(a))
  const rows = list.map(p => ({ label: labelOf(p), views: p.views, likes: p.likes, comments: p.comments, shares: p.shares, saves: p.saves }))
  if (rows.length <= CHART_ROWS) return { rows, top: 0 }
  const top = rows.slice(0, CHART_ROWS - 1)
  const rest = rows.slice(CHART_ROWS - 1)
  const sum = (key: 'views' | 'likes' | 'comments' | 'shares' | 'saves') => rest.reduce((a, r) => a + r[key], 0)
  return { rows: [...top, { label: `其他 ${rest.length} 則`, views: sum('views'), likes: sum('likes'), comments: sum('comments'), shares: sum('shares'), saves: sum('saves') }], top: top.length }
})
const chartLabels = computed(() => chartRows.value.rows.map(r => r.label))
const viewsData = computed(() => [{ label: '觀看', data: chartRows.value.rows.map(r => r.views), color: SERIES_GREEN }])
const partsData = computed(() => PARTS.map(part => ({ label: part.label, data: chartRows.value.rows.map(r => r[part.key]), color: part.color })))
// 橫條圖的高度跟著條數走（最多 CHART_ROWS 條，所以不會把頁面撐長）
const rowsHeight = computed(() => Math.max(84, chartRows.value.rows.length * 24 + 34))
const view = ref<'chart' | 'table'>('chart')
const daily = computed(() => {
  const today = todayTaipei()
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13))
  const counts = new Map(days.map(d => [d, { comments: 0, dms: 0 }]))
  for (const c of comments.value) {
    if (c.mine) continue
    const slot = counts.get(minutesToAt(Math.floor(Date.parse(c.createdAt) / 60000) + 480).slice(0, 10))
    if (!slot) continue
    slot.comments += 1
    if (sentDm(c)) slot.dms += 1
  }
  const total = (key: 'comments' | 'dms') => days.reduce((a, d) => a + counts.get(d)![key], 0)
  return {
    labels: days.map(fmtDay),
    // 兩個都是「則數」，同一個刻度可以並排；顏色取互動組成那組驗過的前兩個
    data: [{ label: '留言', data: days.map(d => counts.get(d)!.comments), color: PARTS[0].color }, { label: '私訊送出', data: days.map(d => counts.get(d)!.dms), color: PARTS[1].color }],
    summary: `近 14 天留言 ${total('comments')} 則、私訊送出 ${total('dms')} 則`,
  }
})
// ---- 轉換漏斗：觀看 → 留言 → 符合條件 → 已回覆 → 私訊送出 ----
const pct = (part: number, whole: number) => (whole ? `${(part / whole * 100).toFixed(part / whole < 0.1 ? 1 : 0)}%` : '—')
const funnel = computed(() => {
  const s = series.value!
  const views = totals.value.views
  const steps = [
    { label: '觀看', value: fmtNum(views), n: views, note: `互動率 ${rate(totals.value.engagement, views)}` },
    { label: '留言', value: `${fmtNum(s.received)} 則`, n: s.received, note: views ? `觀看的 ${pct(s.received, views)}` : '' },
    { label: '符合條件', value: `${fmtNum(s.matched)} 則`, n: s.matched, note: s.received ? `留言的 ${pct(s.matched, s.received)}` : '' },
    { label: '已回覆', value: `${fmtNum(s.replied)} 則`, n: s.replied, note: !s.replies.length ? '沒有設定回覆' : s.failed ? `${s.failed} 則送出失敗` : s.matched ? `符合條件的 ${pct(s.replied, s.matched)}` : '' },
    { label: '私訊送出', value: `${fmtNum(s.dms)} 則`, n: s.dms, note: !s.dmText ? '沒有設定私訊' : s.matched ? `符合條件的 ${pct(s.dms, s.matched)}` : '' },
  ]
  // 觀看跟後面幾步差太多（幾千比幾十），長條分兩組各自比：觀看自己滿格，其餘以留言數為基準
  return steps.map((step, i) => ({ ...step, width: i === 0 ? 100 : s.received ? Math.max(step.n ? 3 : 0, Math.round(step.n / s.received * 100)) : 0 }))
})

// ---- 目前的回覆設定（不用開視窗就看得到）----
const condition = computed(() => {
  const s = series.value!
  if (s.matchType !== 'keyword') return '任何留言'
  const words = s.keywords.split(/[,，、\n]/).map(k => k.trim()).filter(Boolean)
  return words.length ? `留言含${words.map(w => `「${w}」`).join('')}` : '還沒填關鍵字'
})

// ---- 各平台比較 ----
const sentDm = (c: CommentRow) => !c.mine && c.status === 'sent' && Boolean(c.dmText) && !c.error
const byPlatform = computed(() => PLATFORM_KEYS.map((key) => {
  const list = (series.value?.posts ?? []).filter(p => account(p.accountId)?.platform === key)
  const views = list.reduce((a, p) => a + p.views, 0)
  const replies = list.reduce((a, p) => a + p.comments, 0)
  const dms = comments.value.filter(c => sentDm(c) && account(c.accountId)?.platform === key).length
  return { key, posts: list.length, views, rate: pct(replies, views), dms: key === 'threads' || key === 'youtube' ? '—' : fmtNum(dms) }
}).filter(r => r.posts))

// ---- 名單：拿到私訊的人 ----
const leads = computed(() => comments.value.filter(sentDm))
// 右側的分頁：全部留言、只看待回覆的、名單
const side = ref<'talk' | 'waiting' | 'leads'>('talk')
const waitingCount = computed(() => groupConversations(comments.value.map(c => ({ ...c }))).conversations.filter(c => c.waiting).length)
const LEADS_PAGE = 8
const leadPage = ref(1)
const leadPages = computed(() => Math.max(1, Math.ceil(leads.value.length / LEADS_PAGE)))
const shownLeads = computed(() => leads.value.slice((leadPage.value - 1) * LEADS_PAGE, leadPage.value * LEADS_PAGE))
const timeOf = (iso: string) => minutesToAt(Math.floor(Date.parse(iso) / 60000) + 480).replace('T', ' ')
function downloadLeads() {
  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`
  const rows = leads.value.map(c => [c.author, PLATFORMS[account(c.accountId)?.platform ?? 'instagram'].label, c.text, timeOf(c.createdAt)].map(cell).join(','))
  // 開頭的 BOM 讓 Excel 用 UTF-8 開，中文才不會變亂碼
  const blob = new Blob([`\uFEFF帳號,平台,留言,時間\n${rows.join('\n')}`], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${series.value!.name}-名單.csv`
  link.click()
  URL.revokeObjectURL(link.href)
}

// ---- 一段文字版的成效，貼給主管或客戶 ----
async function copySummary() {
  const s = series.value!
  const lines = [
    `【${s.name}】`,
    `觀看 ${fmtNum(totals.value.views)}，互動率 ${rate(totals.value.engagement, totals.value.views)}`,
    `留言 ${fmtNum(s.received)} 則，符合條件 ${fmtNum(s.matched)} 則，已回覆 ${fmtNum(s.replied)} 則，私訊送出 ${fmtNum(s.dms)} 則`,
    ...byPlatform.value.map(r => `${PLATFORMS[r.key].label}：${r.posts} 則貼文，觀看 ${fmtNum(r.views)}，留言率 ${r.rate}`),
  ]
  if (await attempt(() => navigator.clipboard.writeText(lines.join('\n')))) notify('已複製')
}

const viewsSummary = computed(() => `各貼文觀看：${chartRows.value.rows.map(r => `${r.label} ${r.views}`).join('、')}`)
const partsSummary = computed(() => `各貼文互動組成：${chartRows.value.rows.map(r => `${r.label} 按讚 ${r.likes}、留言 ${r.comments}、分享 ${r.shares}、收藏 ${r.saves}`).join('；')}`)

</script>

<template>
  <div v-if="missing" class="empty">找不到這個系列文。<NuxtLink to="/series">返回系列文管理</NuxtLink></div>
  <template v-else-if="series">
    <div class="row between">
      <div class="row" style="gap: 12px">
        <NuxtLink to="/series" class="btn-text" style="padding-left: 0">← 系列文管理</NuxtLink>
        <h1 class="wrap-any">{{ series.name }}</h1>
      </div>
      <div class="row">
        <button type="button" class="btn" :disabled="syncing || !series.posts.length" @click="sync">{{ syncing ? '同步中…' : '立即同步' }}</button>
        <button type="button" class="btn" @click="copySummary">複製成效摘要</button>
        <button type="button" class="btn" @click="settingsOpen = true">設定系列文</button>
      </div>
    </div>

    <div class="stats" aria-label="從觀看到私訊的轉換">
      <div v-for="f in funnel" :key="f.label" class="stat">
        <span class="small muted">{{ f.label }}</span>
        <b>{{ f.value }}</b>
        <div class="funnel-track" aria-hidden="true"><div class="funnel-bar" :style="{ width: `${f.width}%` }" /></div>
        <span class="small muted">{{ f.note || '　' }}</span>
      </div>
    </div>

    <div class="fit-grid cols-3 fill">
      <div class="fit-col">
        <section class="card shrink" style="gap: 8px">
          <h2>有人留言時</h2>
          <dl class="settings-list">
            <dt>條件</dt><dd>{{ condition }}</dd>
            <dt>回覆</dt><dd><template v-if="series.replies.length">{{ series.replies.length }} 句輪流　<span class="muted">{{ series.replies[0] }}</span></template><span v-else class="muted">不回覆</span></dd>
            <dt>私訊</dt><dd><span v-if="series.dmText">{{ series.dmText }}</span><span v-else class="muted">不私訊</span></dd>
          </dl>
        </section>
        <section v-if="byPlatform.length" class="card fill" style="gap: 6px">
          <h2>各平台</h2>
          <table class="compact">
            <thead><tr><th scope="col">平台</th><th scope="col">觀看</th><th scope="col">留言率</th><th scope="col">私訊</th></tr></thead>
            <tbody>
              <tr v-for="r in byPlatform" :key="r.key">
                <th scope="row"><PlatformIcon :platform="r.key" label /><div class="small muted" style="font-weight: 400">{{ r.posts }} 則</div></th>
                <td>{{ fmtNum(r.views) }}</td><td>{{ r.rate }}</td><td>{{ r.dms }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>

      <section class="card">
        <div class="row between">
          <h2>成效統計</h2>
          <div v-if="series.posts.length" class="seg" role="group" aria-label="顯示方式">
            <button type="button" :aria-pressed="view === 'chart'" @click="view = 'chart'">圖表</button>
            <button type="button" :aria-pressed="view === 'table'" @click="view = 'table'">資料表</button>
          </div>
        </div>
        <div v-if="!series.posts.length" class="empty">還沒有貼文　<button type="button" class="btn-text" @click="settingsOpen = true">加入貼文</button></div>
        <div v-else-if="view === 'chart'" class="charts fill scroll">
          <div class="col" style="gap: 4px">
            <h3 class="chart-title">各貼文觀看<span v-if="chartRows.top" class="small muted" style="font-weight: 400">　觀看最高的 {{ chartRows.top }} 則</span></h3>
            <BarChart horizontal value-labels :labels="chartLabels" :datasets="viewsData" :height="rowsHeight" :summary="viewsSummary" />
          </div>
          <div class="col" style="gap: 4px">
            <h3 class="chart-title">互動組成</h3>
            <BarChart horizontal stacked :labels="chartLabels" :datasets="partsData" :height="rowsHeight + 34" :summary="partsSummary" />
          </div>
          <div class="chart-fill">
            <h3 class="chart-title">每日留言與私訊<span class="small muted" style="font-weight: 400">　近 14 天</span></h3>
            <BarChart fill :labels="daily.labels" :datasets="daily.data" :summary="daily.summary" />
          </div>
        </div>
        <div v-else class="table-scroll fill scroll">
          <table style="min-width: 520px">
            <thead>
              <tr><th scope="col">貼文</th><th scope="col">發佈</th><th scope="col">觀看</th><th scope="col">按讚</th><th scope="col">留言</th><th scope="col">分享</th><th scope="col">收藏</th></tr>
            </thead>
            <tbody>
              <tr v-for="(p, i) in series.posts" :key="p.id">
                <th scope="row">{{ postLabels[i] }}
                  <div class="small" style="font-weight: 400"><a :href="p.url" target="_blank" rel="noopener noreferrer" style="color: var(--muted)">{{ p.text || '（沒有文字的貼文）' }}</a></div>
                </th>
                <td style="white-space: nowrap">{{ dayOf(p.publishedAt) }}</td>
                <td>{{ fmtNum(p.views) }}</td>
                <td>{{ fmtNum(p.likes) }}</td>
                <td>{{ fmtNum(p.comments) }}</td>
                <td>{{ fmtNum(p.shares) }}</td>
                <td>{{ fmtNum(p.saves) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <div class="row between">
          <div class="seg" role="group" aria-label="右側內容">
            <button type="button" :aria-pressed="side === 'talk'" @click="side = 'talk'">留言紀錄</button>
            <button type="button" :aria-pressed="side === 'waiting'" @click="side = 'waiting'">待回覆 {{ waitingCount }}</button>
            <button type="button" :aria-pressed="side === 'leads'" @click="side = 'leads'">名單 {{ leads.length }}</button>
          </div>
          <button v-if="side === 'leads' && leads.length" type="button" class="btn sm" @click="downloadLeads">下載 CSV</button>
        </div>
        <ConversationList v-if="side !== 'leads'" :rows="comments" show-platform :waiting-only="side === 'waiting'" @changed="load()" />
        <template v-else>
          <div class="comment-log fill scroll" tabindex="0" aria-label="拿到私訊的人">
            <div v-for="c in shownLeads" :key="c.id" class="comment-item">
              <div class="row between" style="gap: 6px 12px">
                <span class="pf-row bold" style="gap: 6px; font-size: 14px"><PlatformIcon :platform="account(c.accountId)?.platform" :size="14" />{{ c.author }}</span>
                <span class="small muted">{{ timeOf(c.createdAt).slice(5) }}</span>
              </div>
              <span class="small muted wrap-any">{{ c.text }}</span>
            </div>
            <div v-if="!leads.length" class="empty">還沒有人拿到私訊</div>
          </div>
          <div v-if="leadPages > 1" class="row between" role="navigation" aria-label="名單分頁">
            <button type="button" class="btn sm" :disabled="leadPage <= 1" @click="leadPage -= 1">上一頁</button>
            <span class="small muted" aria-live="polite">第 {{ leadPage }} / {{ leadPages }} 頁</span>
            <button type="button" class="btn sm" :disabled="leadPage >= leadPages" @click="leadPage += 1">下一頁</button>
          </div>
        </template>
      </section>
    </div>

    <SeriesDialog v-model="settingsOpen" :series="series" @saved="load()" @deleted="backToList" />
  </template>
  <div v-else class="empty">載入中…</div>
</template>
