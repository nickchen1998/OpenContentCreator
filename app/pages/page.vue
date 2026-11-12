<script setup lang="ts">
// 公開頁面的編輯畫面：左邊調外觀與區塊（開關、順序、內容），右邊是即時預覽。
// 改動會自動存成草稿；按「發布」才會更新對外看到的版本。
interface State { slug: string, published: boolean, dirty: boolean, draft: PageConfig, images: { avatar: string, cover: string, series: Record<string, string> }, view: PageView }
type Candidate = InsightPost & { seriesId: number | null }
const { account } = useLookup()
const state = ref<State>()
const draft = ref<PageConfig>(defaultPageConfig())
const slug = ref('')
// 右邊預覽的三種樣子：手機、電腦上的頁面，以及網址貼到通訊軟體時的卡片
const device = ref<'phone' | 'desktop' | 'chat'>('phone')
const saving = ref(false)
const busy = ref(false)
const candidates = ref<Candidate[]>([])
const seriesList = ref<Series[]>([])

function apply(next: State) {
  state.value = next
  draft.value = JSON.parse(JSON.stringify(next.draft))
  slug.value = next.slug
}
onMounted(async () => {
  const [page, posts, list] = await Promise.all([
    attempt(() => api<State>('/api/page')),
    attempt(() => api<Candidate[]>('/api/series/candidates')),
    attempt(() => api<Series[]>('/api/series')),
  ])
  if (page) apply(page)
  candidates.value = posts ?? []
  seriesList.value = list ?? []
})

// 存草稿：連續改動時等停下來再送，免得每按一下就打一次伺服器
let timer: ReturnType<typeof setTimeout> | undefined
async function save() {
  clearTimeout(timer)
  saving.value = true
  const next = await attempt(() => api<State>('/api/page', { method: 'PUT', body: { slug: slug.value, draft: draft.value } }))
  saving.value = false
  if (next) apply(next)
  return Boolean(next)
}
function touch() {
  clearTimeout(timer)
  timer = setTimeout(save, 500)
}
onBeforeUnmount(() => clearTimeout(timer))

const url = computed(() => (import.meta.client ? `${window.location.origin}/p/${state.value?.slug ?? ''}` : ''))
const host = computed(() => (import.meta.client ? window.location.host : ''))
async function copyUrl() {
  if (await attempt(() => navigator.clipboard.writeText(url.value))) notify('已複製網址')
}
async function publish() {
  busy.value = true
  // 先把還沒送出的改動存好，發布的才會是畫面上看到的這一版
  if (await save()) {
    const next = await attempt(() => api<State>('/api/page/publish', { method: 'POST' }), '已發布')
    if (next) apply(next)
  }
  busy.value = false
}
async function unpublish() {
  if (!confirm('取消發布？網址會立刻變成找不到頁面，內容會留著。')) return
  busy.value = true
  const next = await attempt(() => api<State>('/api/page/unpublish', { method: 'POST' }), '已取消發布')
  if (next) apply(next)
  busy.value = false
}

// ---- 外觀 ----
const preset = computed(() => themePreset(draft.value.theme))
const custom = computed(() => Boolean(draft.value.accent || draft.value.bg))
function setTheme(theme: PageTheme) {
  Object.assign(draft.value, { theme, accent: '', bg: '' })
  touch()
}
function setColor(key: 'accent' | 'bg', value: string) {
  draft.value[key] = value
  touch()
}
async function upload(kind: 'avatar' | 'cover' | 'series', event: Event, id?: number) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  busy.value = true
  // 還沒建立過頁面時先存一次草稿，圖片才有地方掛
  if (state.value?.slug !== slug.value || !await save()) {
    busy.value = false
    return
  }
  const next = await attempt(() => api<State>('/api/page/image', { method: 'PUT', query: { kind, id }, body: file, headers: { 'Content-Type': file.type } }), '已上傳')
  if (next) apply(next)
  busy.value = false
}
async function removeImage(kind: 'avatar' | 'cover' | 'series', id?: number) {
  const next = await attempt(() => api<State>('/api/page/image', { method: 'DELETE', query: { kind, id } }))
  if (next) apply(next)
}

// ---- 區塊 ----
function move(index: number, step: number) {
  const list = draft.value.blocks
  const to = index + step
  if (to < 0 || to >= list.length) return
  ;[list[index], list[to]] = [list[to]!, list[index]!]
  touch()
}
function toggle(index: number) {
  draft.value.blocks[index]!.on = !draft.value.blocks[index]!.on
  touch()
}
const noteOf = (type: PageBlock) => {
  const d = draft.value
  if (type === 'profile') return d.name || '還沒填名稱'
  if (type === 'accounts') return '粉絲、平均觀看、互動率、成長'
  if (type === 'stats') return `近 ${d.statsDays} 天・${d.statsShow.map(k => PAGE_STAT_LABELS[k]).join('、') || '還沒選'}`
  if (type === 'collab') return [d.collabItems.length ? `${d.collabItems.length} 個項目` : '', d.collabBrands.length ? `${d.collabBrands.length} 個品牌` : '', d.contactEmail].filter(Boolean).join('・') || '還沒填'
  if (type === 'posts') return [d.postIds.length ? `置頂 ${d.postIds.length} 則` : '', d.postsEmbed ? '嵌入' : ''].filter(Boolean).join('・') || '自動帶入觀看最高的'
  if (type === 'series') return d.seriesIds.length ? `已選 ${d.seriesIds.length} 個` : '還沒選'
  if (type === 'text') return d.textTitle || d.textBody.slice(0, 20) || '還沒填'
  return d.links.length ? `${d.links.length} 顆` : '還沒加'
}
const editable = (type: PageBlock) => type !== 'accounts'

// 編輯某個區塊的內容：在視窗裡改一份副本，按儲存才套用
const editing = ref<PageBlock>()
const dialogOpen = ref(false)
const form = reactive({
  name: '', tagline: '', bio: '', postIds: [] as number[], seriesIds: [] as number[], textTitle: '', textBody: '', links: [] as { label: string, url: string }[],
  statsDays: 28, statsShow: [] as PageStat[], postsEmbed: false,
  collabItems: [] as string[], collabBrands: [] as string[], contactEmail: '', contactLabel: '',
  seriesLayout: 'h' as 'h' | 'v', seriesTop: false, seriesText: {} as Record<string, string>,
})
// 合作項目與品牌：打字按 Enter（或「加入」）變成一個標籤
const adding = reactive({ collabItems: '', collabBrands: '' })
function addTag(key: 'collabItems' | 'collabBrands') {
  const value = adding[key].trim()
  const max = PAGE_LIMITS[key]
  if (value && !form[key].includes(value) && form[key].length < max) form[key].push(value)
  adding[key] = ''
}
const dialogError = ref('')
// 挑精選貼文時的搜尋：已經勾的不會因為被篩掉而取消
const postQuery = ref('')
const foundCandidates = computed(() => candidates.value.filter(p => keywordMatcher(postQuery.value)(p.text)))
function edit(type: PageBlock) {
  const d = draft.value
  Object.assign(form, {
    name: d.name, tagline: d.tagline, bio: d.bio, postIds: [...d.postIds], seriesIds: [...d.seriesIds], textTitle: d.textTitle, textBody: d.textBody, links: d.links.map(l => ({ ...l })),
    statsDays: d.statsDays, statsShow: [...d.statsShow], postsEmbed: d.postsEmbed,
    collabItems: [...d.collabItems], collabBrands: [...d.collabBrands], contactEmail: d.contactEmail, contactLabel: d.contactLabel,
    seriesLayout: d.seriesLayout, seriesTop: d.seriesTop, seriesText: { ...d.seriesText },
  })
  Object.assign(adding, { collabItems: '', collabBrands: '' })
  postQuery.value = ''
  if (type === 'links' && !form.links.length) form.links.push({ label: '', url: '' })
  editing.value = type
  dialogError.value = ''
  dialogOpen.value = true
}
function applyEdit() {
  const type = editing.value
  const d = draft.value
  if (type === 'links') {
    const filled = form.links.filter(l => l.label.trim() || l.url.trim())
    if (filled.some(l => !l.label.trim() || !/^(https?:\/\/|mailto:)/i.test(l.url.trim()))) {
      dialogError.value = '每顆按鈕都要有文字，連結要以 https:// 或 mailto: 開頭'
      return
    }
    d.links = filled.map(l => ({ label: l.label.trim(), url: l.url.trim() }))
  }
  if (type === 'posts' && form.postIds.length > PAGE_LIMITS.posts) {
    dialogError.value = `最多選 ${PAGE_LIMITS.posts} 則`
    return
  }
  if (type === 'series' && form.seriesIds.length > PAGE_LIMITS.series) {
    dialogError.value = `最多選 ${PAGE_LIMITS.series} 個`
    return
  }
  if (type === 'collab') {
    addTag('collabItems')
    addTag('collabBrands')
    if (form.contactEmail.trim() && !isContactEmail(form.contactEmail.trim())) {
      dialogError.value = '聯絡信箱的格式不對'
      return
    }
    Object.assign(d, { collabItems: [...form.collabItems], collabBrands: [...form.collabBrands], contactEmail: form.contactEmail.trim(), contactLabel: form.contactLabel.trim() })
  }
  if (type === 'profile') Object.assign(d, { name: form.name, tagline: form.tagline, bio: form.bio })
  if (type === 'stats') Object.assign(d, { statsDays: form.statsDays, statsShow: PAGE_STATS.filter(k => form.statsShow.includes(k)) })
  if (type === 'posts') Object.assign(d, { postIds: [...form.postIds], postsEmbed: form.postsEmbed })
  if (type === 'series') Object.assign(d, { seriesIds: [...form.seriesIds], seriesLayout: form.seriesLayout, seriesTop: form.seriesTop, seriesText: { ...form.seriesText } })
  if (type === 'text') Object.assign(d, { textTitle: form.textTitle, textBody: form.textBody })
  dialogOpen.value = false
  touch()
}
const dayOf = (iso: string) => fmtDay(minutesToAt(Math.floor(Date.parse(iso) / 60000) + 480).slice(0, 10))
</script>

<template>
  <template v-if="state">
    <div class="row between">
      <div class="row" style="gap: 8px 12px; min-width: 0">
        <span class="pill" :class="{ muted: !state.published }">{{ state.published ? '已發布' : '未發布' }}</span>
        <label class="row small muted" style="gap: 6px; flex-wrap: nowrap">/p/
          <input v-model="slug" type="text" maxlength="32" aria-label="網址代號" style="width: 150px" @change="save">
        </label>
        <button type="button" class="btn sm" :disabled="!state.published" @click="copyUrl">複製網址</button>
        <a v-if="state.published" class="btn sm" :href="url" target="_blank" rel="noopener noreferrer">開啟</a>
      </div>
      <div class="row">
        <span v-if="saving" class="small muted" aria-live="polite">儲存中…</span>
        <span v-else-if="state.dirty" class="small" style="color: var(--warn)">有還沒發布的修改</span>
        <button v-if="state.published" type="button" class="btn" :disabled="busy" @click="unpublish">取消發布</button>
        <button type="button" class="btn primary" :disabled="busy || saving" @click="publish">{{ state.published ? '更新發布' : '發布' }}</button>
      </div>
    </div>

    <div class="fit-grid cols-2 fill">
      <section class="card">
        <div class="col fill scroll" style="gap: 14px">
          <div class="col" style="gap: 8px">
            <h2>外觀</h2>
            <div class="row" role="group" aria-label="主題">
              <button v-for="t in PAGE_THEMES" :key="t" type="button" class="chip" :aria-pressed="draft.theme === t && !custom" @click="setTheme(t)">
                <span class="swatch-dot" :style="{ background: themePreset(t).accent, boxShadow: `0 0 0 3px ${themePreset(t).bg}, 0 0 0 4px var(--line-strong)` }" aria-hidden="true" />{{ PAGE_THEME_LABELS[t] }}
              </button>
            </div>
            <div class="row" style="gap: 8px 12px">
              <span class="small bold" style="min-width: 36px">主色</span>
              <div class="row" role="group" aria-label="主色調色盤" style="gap: 6px">
                <button v-for="c in PAGE_ACCENTS" :key="c[1]" type="button" class="swatch round" :style="{ background: c[1] }" :aria-pressed="draft.accent === c[1]" :aria-label="`主色 ${c[0]}`" @click="setColor('accent', c[1])" />
              </div>
              <label class="row small" style="gap: 6px">自訂<input type="color" class="color-input" :value="draft.accent || preset.accent" @change="setColor('accent', ($event.target as HTMLInputElement).value)"></label>
            </div>
            <div class="row" style="gap: 8px 12px">
              <span class="small bold" style="min-width: 36px">背景</span>
              <div class="row" role="group" aria-label="背景色調色盤" style="gap: 6px">
                <button v-for="c in PAGE_GROUNDS" :key="c[1]" type="button" class="swatch" :style="{ background: c[1] }" :aria-pressed="draft.bg === c[1]" :aria-label="`背景 ${c[0]}`" @click="setColor('bg', c[1])" />
              </div>
              <label class="row small" style="gap: 6px">自訂<input type="color" class="color-input" :value="draft.bg || preset.bg" @change="setColor('bg', ($event.target as HTMLInputElement).value)"></label>
            </div>
            <div class="row" style="gap: 8px 12px">
              <span class="small bold" style="min-width: 36px">圖片</span>
              <label class="btn sm">{{ state.images.avatar ? '更換頭像' : '上傳頭像' }}<input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" :disabled="busy" @change="upload('avatar', $event)"></label>
              <button v-if="state.images.avatar" type="button" class="btn sm" @click="removeImage('avatar')">移除頭像</button>
              <label class="btn sm">{{ state.images.cover ? '更換背景圖' : '上傳背景圖' }}<input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" :disabled="busy" @change="upload('cover', $event)"></label>
              <button v-if="state.images.cover" type="button" class="btn sm" @click="removeImage('cover')">移除背景圖</button>
            </div>
          </div>

          <div class="col" style="gap: 8px">
            <h2>分享預覽</h2>
            <!-- 左邊只負責設定；貼出去的樣子在右邊預覽的「快取」分頁。點進輸入框時自動切過去 -->
            <label class="field">標題<input v-model="draft.shareTitle" type="text" maxlength="60" :placeholder="draft.name" @input="touch" @focus="device = 'chat'"></label>
            <label class="field">說明<textarea v-model="draft.shareText" rows="2" maxlength="160" :placeholder="draft.bio" style="resize: none" @input="touch" @focus="device = 'chat'" /></label>
          </div>

          <div class="col" style="gap: 4px">
            <h2>區塊</h2>
            <div class="col divided" style="gap: 8px">
              <div v-for="(b, i) in draft.blocks" :key="b.type" class="row between" style="gap: 8px 12px" :style="{ opacity: b.on ? 1 : 0.6 }">
                <div class="col" style="gap: 0; min-width: 0; flex: 1 1 140px">
                  <span class="bold">{{ PAGE_BLOCK_LABELS[b.type] }}</span>
                  <span class="small muted wrap-any">{{ noteOf(b.type) }}</span>
                </div>
                <div class="row" style="gap: 6px">
                  <button type="button" class="btn sm" :disabled="i === 0" :aria-label="`${PAGE_BLOCK_LABELS[b.type]} 上移`" @click="move(i, -1)">上移</button>
                  <button type="button" class="btn sm" :disabled="i === draft.blocks.length - 1" :aria-label="`${PAGE_BLOCK_LABELS[b.type]} 下移`" @click="move(i, 1)">下移</button>
                  <button v-if="editable(b.type)" type="button" class="btn sm" :aria-label="`編輯 ${PAGE_BLOCK_LABELS[b.type]}`" @click="edit(b.type)">編輯</button>
                  <button type="button" class="chip" :aria-pressed="b.on" :aria-label="`${PAGE_BLOCK_LABELS[b.type]} ${b.on ? '顯示中' : '已隱藏'}`" @click="toggle(i)">{{ b.on ? '顯示' : '隱藏' }}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="row between">
          <h2>預覽</h2>
          <div class="seg" role="group" aria-label="預覽裝置">
            <button type="button" :aria-pressed="device === 'phone'" @click="device = 'phone'">手機</button>
            <button type="button" :aria-pressed="device === 'desktop'" @click="device = 'desktop'">電腦</button>
            <button type="button" :aria-pressed="device === 'chat'" @click="device = 'chat'">快取</button>
          </div>
        </div>
        <div class="preview-stage fill">
          <!-- 把網址貼到 LINE 之類的地方時大概的樣子：一則帶網址的訊息，底下是預覽卡片（圖片、標題、說明、網域） -->
          <div v-if="device === 'chat'" class="chat-mock scroll" aria-label="貼到通訊軟體時的樣子">
            <div class="chat-bubble wrap-any">{{ url }}</div>
            <div class="share-card">
              <div class="share-image" :class="{ empty: !state.view.share.image }" :style="state.view.share.image ? { backgroundImage: `url('${state.view.share.image}')` } : undefined" />
              <div class="col" style="gap: 2px; padding: 12px 14px; min-width: 0">
                <span class="bold share-clip two">{{ state.view.share.title }}</span>
                <span v-if="state.view.share.text" class="small muted share-clip two">{{ state.view.share.text }}</span>
                <span class="small muted">{{ host }}</span>
              </div>
            </div>
          </div>
          <div v-else class="preview-frame scroll" :class="device">
            <PublicPageView :view="state.view" />
          </div>
        </div>
      </section>
    </div>

    <AppDialog v-model="dialogOpen" :wide="editing === 'posts' || editing === 'series'" :title="editing ? PAGE_BLOCK_LABELS[editing] : ''" :error="dialogError" submit-label="套用" @submit="applyEdit">
      <template v-if="editing === 'profile'">
        <label class="field">名稱<input v-model="form.name" type="text" maxlength="40"></label>
        <label class="field">類別<input v-model="form.tagline" type="text" maxlength="30" placeholder="美食・旅遊"></label>
        <label class="field">介紹<textarea v-model="form.bio" rows="4" maxlength="300" /></label>
      </template>
      <template v-else-if="editing === 'stats'">
        <div class="seg" role="group" aria-label="期間" style="align-self: flex-start">
          <button v-for="n in PAGE_STAT_DAYS" :key="n" type="button" :aria-pressed="form.statsDays === n" @click="form.statsDays = n">{{ n }} 天</button>
        </div>
        <div class="stat-options">
          <label v-for="k in PAGE_STATS" :key="k" class="check"><input v-model="form.statsShow" type="checkbox" :value="k">{{ PAGE_STAT_LABELS[k] }}</label>
        </div>
      </template>
      <template v-else-if="editing === 'collab'">
        <div v-for="group in ([['collabItems', '合作項目', 20], ['collabBrands', '合作過的品牌', 30]] as const)" :key="group[0]" class="col" style="gap: 6px">
          <span class="small muted">{{ group[1] }}</span>
          <div class="row" style="gap: 8px">
            <span v-for="(item, ti) in form[group[0]]" :key="item" class="chip" style="gap: 6px">{{ item }}<button type="button" class="tag-x" :aria-label="`移除 ${item}`" @click="form[group[0]].splice(ti, 1)">×</button></span>
            <input
              v-if="form[group[0]].length < PAGE_LIMITS[group[0]]" v-model="adding[group[0]]" type="text" :maxlength="group[2]" :aria-label="`新增${group[1]}`" placeholder="新增"
              style="width: 130px" @keydown.enter.prevent="addTag(group[0])" @blur="addTag(group[0])"
            >
          </div>
        </div>
        <div class="row" style="gap: 12px; flex-wrap: nowrap; align-items: flex-end">
          <label class="field" style="flex: 2 1 200px">聯絡信箱<input v-model="form.contactEmail" type="text" inputmode="email" autocomplete="off" maxlength="120"></label>
          <label class="field" style="flex: 1 1 120px">按鈕文字<input v-model="form.contactLabel" type="text" maxlength="20" placeholder="合作洽詢"></label>
        </div>
      </template>
      <template v-else-if="editing === 'posts'">
        <div class="row" style="gap: 8px">
          <label class="check"><input v-model="form.postsEmbed" type="checkbox">啟用嵌入</label>
          <InfoTip text="啟用後會改為將平台呈現的貼文直接嵌入，圖片與影片會一起顯示。" />
        </div>
        <div class="row between">
          <span class="small muted">置頂 {{ form.postIds.length }}／{{ PAGE_LIMITS.posts }} 則</span>
          <input v-model="postQuery" type="search" class="search" aria-label="搜尋貼文" placeholder="搜尋貼文" @keydown.enter.prevent>
        </div>
        <div class="post-list" tabindex="0" aria-label="可以選的貼文">
          <label v-for="p in foundCandidates" :key="p.id" class="post-option">
            <input v-model="form.postIds" type="checkbox" :value="p.id" :disabled="!form.postIds.includes(p.id) && form.postIds.length >= PAGE_LIMITS.posts">
            <span class="col grow" style="gap: 2px">
              <span class="wrap-any">{{ p.text || '（沒有文字的貼文）' }}</span>
              <span class="small muted pf-row" style="gap: 6px"><PlatformIcon :platform="account(p.accountId)?.platform" :size="14" />{{ dayOf(p.publishedAt) }} · 觀看 {{ fmtNum(p.views) }}</span>
            </span>
          </label>
          <div v-if="!foundCandidates.length" class="empty">{{ candidates.length ? '找不到符合的貼文' : '還沒有貼文' }}</div>
        </div>
      </template>
      <template v-else-if="editing === 'series'">
        <div class="row between">
          <label class="check"><input v-model="form.seriesTop" type="checkbox">顯示最熱門的 {{ PAGE_LIMITS.seriesTop }} 則貼文</label>
          <div class="seg" role="group" aria-label="熱門貼文的排列">
            <button type="button" :aria-pressed="form.seriesLayout === 'h'" @click="form.seriesLayout = 'h'">水平</button>
            <button type="button" :aria-pressed="form.seriesLayout === 'v'" @click="form.seriesLayout = 'v'">垂直</button>
          </div>
        </div>
        <div class="post-list" tabindex="0" aria-label="可以選的系列文">
          <div v-for="s in seriesList" :key="s.id" class="series-option">
            <label class="check bold">
              <input v-model="form.seriesIds" type="checkbox" :value="s.id" :disabled="!form.seriesIds.includes(s.id) && form.seriesIds.length >= PAGE_LIMITS.series">{{ s.name }}
            </label>
            <template v-if="form.seriesIds.includes(s.id)">
              <div class="row" style="gap: 8px 12px">
                <div v-if="state.images.series[s.id]" class="series-cover" role="img" :aria-label="`${s.name} 的封面`" :style="{ backgroundImage: `url('${state.images.series[s.id]}')` }" />
                <label class="btn sm">{{ state.images.series[s.id] ? '更換封面' : '上傳封面' }}<input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" :disabled="busy" @change="upload('series', $event, s.id)"></label>
                <button v-if="state.images.series[s.id]" type="button" class="btn sm" @click="removeImage('series', s.id)">移除封面</button>
              </div>
              <label class="field">介紹<input v-model="form.seriesText[s.id]" type="text" maxlength="80"></label>
            </template>
          </div>
        </div>
        <div v-if="!seriesList.length" class="empty">還沒有系列文</div>
      </template>
      <template v-else-if="editing === 'text'">
        <label class="field">標題<input v-model="form.textTitle" type="text" maxlength="40"></label>
        <label class="field">內容<textarea v-model="form.textBody" rows="6" maxlength="1000" /></label>
      </template>
      <template v-else-if="editing === 'links'">
        <div v-for="(l, i) in form.links" :key="i" class="row" style="gap: 8px; flex-wrap: nowrap; align-items: flex-end">
          <label class="field" style="flex: 1 1 120px">按鈕文字<input v-model="l.label" type="text" maxlength="30"></label>
          <label class="field" style="flex: 2 1 200px">連結<input v-model="l.url" type="url" maxlength="300" placeholder="https://"></label>
          <button type="button" class="btn sm" :aria-label="`移除第 ${i + 1} 顆按鈕`" @click="form.links.splice(i, 1)">移除</button>
        </div>
        <button v-if="form.links.length < PAGE_LIMITS.links" type="button" class="btn sm" style="align-self: flex-start" @click="form.links.push({ label: '', url: '' })">新增一顆</button>
      </template>
    </AppDialog>
  </template>
  <div v-else class="empty">載入中…</div>
</template>
