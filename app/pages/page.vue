<script setup lang="ts">
// 公開頁面的編輯畫面：左邊調外觀與區塊（開關、順序、內容），右邊是即時預覽。
// 改動會自動存成草稿；按「發布」才會更新對外看到的版本。
interface State { slug: string, published: boolean, dirty: boolean, draft: PageConfig, images: { avatar: string, cover: string }, view: PageView }
type Candidate = InsightPost & { seriesId: number | null }
const { account } = useLookup()
const state = ref<State>()
const draft = ref<PageConfig>(defaultPageConfig())
const slug = ref('')
const device = ref<'phone' | 'desktop'>('phone')
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
async function upload(kind: 'avatar' | 'cover', event: Event) {
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
  const next = await attempt(() => api<State>('/api/page/image', { method: 'PUT', query: { kind }, body: file, headers: { 'Content-Type': file.type } }), '已上傳')
  if (next) apply(next)
  busy.value = false
}
async function removeImage(kind: 'avatar' | 'cover') {
  const next = await attempt(() => api<State>('/api/page/image', { method: 'DELETE', query: { kind } }))
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
  if (type === 'accounts') return '已連結的帳號與粉絲數'
  if (type === 'stats') return '近 28 天的觀看、互動率、發文數'
  if (type === 'posts') return d.postIds.length ? `已選 ${d.postIds.length} 則` : '還沒選'
  if (type === 'series') return d.seriesIds.length ? `已選 ${d.seriesIds.length} 個` : '還沒選'
  if (type === 'text') return d.textTitle || d.textBody.slice(0, 20) || '還沒填'
  return d.links.length ? `${d.links.length} 顆` : '還沒加'
}
const editable = (type: PageBlock) => type !== 'accounts' && type !== 'stats'

// 編輯某個區塊的內容：在視窗裡改一份副本，按儲存才套用
const editing = ref<PageBlock>()
const dialogOpen = ref(false)
const form = reactive({ name: '', bio: '', postIds: [] as number[], seriesIds: [] as number[], textTitle: '', textBody: '', links: [] as { label: string, url: string }[] })
const dialogError = ref('')
function edit(type: PageBlock) {
  const d = draft.value
  Object.assign(form, { name: d.name, bio: d.bio, postIds: [...d.postIds], seriesIds: [...d.seriesIds], textTitle: d.textTitle, textBody: d.textBody, links: d.links.map(l => ({ ...l })) })
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
  if (type === 'profile') Object.assign(d, { name: form.name, bio: form.bio })
  if (type === 'posts') d.postIds = [...form.postIds]
  if (type === 'series') d.seriesIds = [...form.seriesIds]
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
            <div class="share-row">
              <div class="col" style="gap: 8px; flex: 1 1 220px; min-width: 0">
                <label class="field">標題<input v-model="draft.shareTitle" type="text" maxlength="60" :placeholder="draft.name" @input="touch"></label>
                <label class="field">說明<textarea v-model="draft.shareText" rows="2" maxlength="160" :placeholder="draft.bio" style="resize: none" @input="touch" /></label>
              </div>
              <!-- 貼到 LINE 之類的地方時大概的樣子：圖片（有背景圖用背景圖，否則頭像）、標題、說明、網域 -->
              <div class="share-card" aria-label="分享預覽的樣子">
                <div class="share-image" :style="state.view.share.image ? { backgroundImage: `url('${state.view.share.image}')` } : undefined" />
                <div class="col" style="gap: 2px; padding: 10px 12px; min-width: 0">
                  <span class="bold share-clip">{{ state.view.share.title }}</span>
                  <span v-if="state.view.share.text" class="small muted share-clip two">{{ state.view.share.text }}</span>
                  <span class="small muted">{{ host }}</span>
                </div>
              </div>
            </div>
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
          </div>
        </div>
        <div class="preview-stage fill">
          <div class="preview-frame scroll" :class="device">
            <PublicPageView :view="state.view" />
          </div>
        </div>
      </section>
    </div>

    <AppDialog v-model="dialogOpen" :wide="editing === 'posts'" :title="editing ? PAGE_BLOCK_LABELS[editing] : ''" :error="dialogError" submit-label="套用" @submit="applyEdit">
      <template v-if="editing === 'profile'">
        <label class="field">名稱<input v-model="form.name" type="text" maxlength="40"></label>
        <label class="field">介紹<textarea v-model="form.bio" rows="4" maxlength="300" /></label>
      </template>
      <template v-else-if="editing === 'posts'">
        <span class="small muted">已選 {{ form.postIds.length }}／{{ PAGE_LIMITS.posts }} 則</span>
        <div class="post-list" tabindex="0" aria-label="可以選的貼文">
          <label v-for="p in candidates" :key="p.id" class="post-option">
            <input v-model="form.postIds" type="checkbox" :value="p.id" :disabled="!form.postIds.includes(p.id) && form.postIds.length >= PAGE_LIMITS.posts">
            <span class="col grow" style="gap: 2px">
              <span class="wrap-any">{{ p.text || '（沒有文字的貼文）' }}</span>
              <span class="small muted pf-row" style="gap: 6px"><PlatformIcon :platform="account(p.accountId)?.platform" :size="14" />{{ dayOf(p.publishedAt) }} · 觀看 {{ fmtNum(p.views) }}</span>
            </span>
          </label>
          <div v-if="!candidates.length" class="empty">還沒有貼文</div>
        </div>
      </template>
      <template v-else-if="editing === 'series'">
        <label v-for="s in seriesList" :key="s.id" class="check">
          <input v-model="form.seriesIds" type="checkbox" :value="s.id" :disabled="!form.seriesIds.includes(s.id) && form.seriesIds.length >= PAGE_LIMITS.series">{{ s.name }}
        </label>
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
