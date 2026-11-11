<script setup lang="ts">
const route = useRoute()
const id = Number(route.params.id)
const { projectStyle, projectLabel, account, platformLabel } = useLookup()
const post = ref<Post>()
const assets = ref<Asset[]>([])
const missing = ref(false)
const captions = reactive<Record<number, string>>({})
const copied = ref(0)
const editOpen = ref(false)
const uploading = ref('')
const fileInput = ref<HTMLInputElement>()

function apply(p: Post) {
  post.value = p
  for (const t of p.targets) captions[t.id] = t.caption
}
async function load() {
  try {
    const data = await api<{ post: Post, assets: Asset[] }>(`/api/posts/${id}`)
    apply(data.post)
    assets.value = data.assets
  }
  catch {
    missing.value = true
  }
}
onMounted(load)

const kind = (a: Asset) => (a.contentType.startsWith('image/') ? '圖片' : a.contentType.startsWith('video/') ? '影片' : '檔案')

async function upload(event: Event) {
  const files = [...((event.target as HTMLInputElement).files ?? [])]
  for (const [i, file] of files.entries()) {
    uploading.value = `上傳中 ${i + 1}/${files.length}：${file.name}`
    const row = await attempt(() => api<Asset>(`/api/posts/${id}/assets`, {
      method: 'PUT', query: { filename: file.name }, body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' },
    }))
    if (row) assets.value.push(row)
  }
  uploading.value = ''
  if (fileInput.value) fileInput.value.value = ''
}
function download(a: Asset) {
  const link = document.createElement('a')
  link.href = `/api/assets/${a.id}`
  link.download = a.filename
  document.body.append(link)
  link.click()
  link.remove()
}
async function downloadAll() {
  for (const a of assets.value) {
    download(a)
    await new Promise(resolve => setTimeout(resolve, 600)) // 瀏覽器會擋同一瞬間的多個下載
  }
}
async function saveNote(a: Asset) {
  await attempt(() => api(`/api/assets/${a.id}`, { method: 'PATCH', body: { note: a.note } }))
}
async function removeAsset(a: Asset) {
  if (!confirm(`刪除素材「${a.filename}」？`)) return
  if (await attempt(() => api(`/api/assets/${a.id}`, { method: 'DELETE' }))) assets.value = assets.value.filter(x => x.id !== a.id)
}

async function patchTarget(t: Target, body: Record<string, unknown>, done?: string) {
  const row = await attempt(() => api<Target>(`/api/targets/${t.id}`, { method: 'PATCH', body }), done)
  if (row) Object.assign(t, row)
  return row
}
async function copyCaption(t: Target) {
  if (captions[t.id] !== t.caption) await patchTarget(t, { caption: captions[t.id] })
  await navigator.clipboard.writeText(captions[t.id] ?? '').catch(() => {})
  copied.value = t.id
  setTimeout(() => (copied.value = 0), 2000)
}

// 發文連結與成效
const linkFor = ref<Target>()
const linkOpen = ref(false)
const linkUrl = ref('')
const metricsFor = ref<Target>()
const metricsOpen = ref(false)
const metrics = reactive({ views: 0, likes: 0, comments: 0, shares: 0, saves: 0 })
const dialogError = ref('')
function openLink(t: Target) {
  linkFor.value = t
  linkUrl.value = t.publishedUrl
  dialogError.value = ''
  linkOpen.value = true
}
async function saveLink() {
  try {
    Object.assign(linkFor.value!, await api<Target>(`/api/targets/${linkFor.value!.id}`, { method: 'PATCH', body: { publishedUrl: linkUrl.value } }))
    linkOpen.value = false
  }
  catch (e: any) {
    dialogError.value = e.message
  }
}
function openMetrics(t: Target) {
  metricsFor.value = t
  Object.assign(metrics, { views: t.views, likes: t.likes, comments: t.comments, shares: t.shares, saves: t.saves })
  dialogError.value = ''
  metricsOpen.value = true
}
async function saveMetrics() {
  try {
    Object.assign(metricsFor.value!, await api<Target>(`/api/targets/${metricsFor.value!.id}`, { method: 'PATCH', body: { ...metrics } }))
    metricsOpen.value = false
  }
  catch (e: any) {
    dialogError.value = e.message
  }
}
const METRIC_LABELS = { views: '觀看', likes: '按讚', comments: '留言', shares: '分享', saves: '收藏' } as const

async function decide(action: 'approve' | 'reject') {
  const p = await attempt(() => api<Post>(`/api/posts/${id}`, { method: 'PATCH', body: { action } }), action === 'approve' ? '已排入' : '已退回')
  if (p) {
    apply(p)
    refreshBoot()
  }
}
async function remove() {
  if (!confirm(`刪除「${post.value!.title}」？素材與文案會一起刪除，無法復原。`)) return
  if (await attempt(() => api(`/api/posts/${id}`, { method: 'DELETE' }))) {
    refreshBoot()
    await navigateTo({ path: '/', query: { w: mondayOf(post.value!.scheduledAt.slice(0, 10)) } })
  }
}
const STATUS = { scheduled: '已規劃', pending: '待確認的提案', rejected: '已退回', withdrawn: '專案已撤回' }
</script>

<template>
  <div v-if="missing" class="empty">找不到這則貼文。<NuxtLink to="/">返回排程</NuxtLink></div>
  <template v-else-if="post">
    <NuxtLink :to="{ path: '/', query: { w: mondayOf(post.scheduledAt.slice(0, 10)) } }" style="align-self: flex-start; font-size: 14px; padding: 12px 0">返回排程</NuxtLink>
    <div class="row between gap-lg">
      <div class="col" style="gap: 8px">
        <h1 class="wrap-any">{{ post.title }}</h1>
        <div class="row" style="font-size: 14px; color: var(--text-2)">
          <span class="tag lg" :style="projectStyle(post.projectId)">{{ projectLabel(post) }}</span>
          <span>預計 {{ fmtAt(post.scheduledAt) }}</span>
          <span>{{ post.targets.map(t => platformLabel(t.accountId)).join('、') }}</span>
          <span class="bold">{{ STATUS[post.status] }}</span>
        </div>
      </div>
      <div class="row">
        <template v-if="post.status === 'pending'">
          <button type="button" class="btn primary" @click="decide('approve')">排入</button>
          <button type="button" class="btn" @click="decide('reject')">退回</button>
        </template>
        <button type="button" class="btn" @click="editOpen = true">修改</button>
        <button type="button" class="btn danger" @click="remove">刪除</button>
      </div>
    </div>

    <div v-if="post.conflicts.length" class="card" style="background: var(--danger-bg); border-color: var(--danger)" role="alert">
      <h2 style="color: var(--danger)">時段衝突</h2>
      <div v-for="c in post.conflicts" :key="c">{{ c }}</div>
    </div>
    <div v-if="post.note" class="card">
      <h2>備註</h2>
      <div class="box pre">{{ post.note }}</div>
    </div>

    <div class="grid-2">
      <section class="card">
        <div class="row between">
          <h2>素材</h2>
          <div class="row">
            <input ref="fileInput" type="file" multiple hidden @change="upload">
            <button type="button" class="btn" :disabled="!!uploading" @click="fileInput?.click()">上傳</button>
            <button type="button" class="btn primary" :disabled="!assets.length" @click="downloadAll">全部下載</button>
          </div>
        </div>
        <div v-if="uploading" class="small muted" role="status">{{ uploading }}</div>
        <div class="col divided" style="gap: 14px">
          <div v-for="a in assets" :key="a.id" class="row" style="gap: 12px; flex-wrap: nowrap">
            <img v-if="a.contentType.startsWith('image/')" class="thumb" :src="`/api/assets/${a.id}?inline=1`" alt="" loading="lazy">
            <div v-else class="thumb" aria-hidden="true">{{ kind(a) }}</div>
            <div class="col grow">
              <div class="wrap-any" style="font-weight: 500">{{ a.filename }}</div>
              <input v-model="a.note" type="text" maxlength="100" :aria-label="`${a.filename} 的說明`" placeholder="說明，例如：輪播第 1 張・封面" style="min-height: 36px; padding: 6px 10px; font-size: 13px" @change="saveNote(a)">
              <div class="small muted">{{ kind(a) }} · {{ fmtSize(a.size) }}</div>
            </div>
            <div class="col">
              <button type="button" class="btn" :aria-label="`下載 ${a.filename}`" @click="download(a)">下載</button>
              <button type="button" class="btn danger" :aria-label="`刪除 ${a.filename}`" @click="removeAsset(a)">刪除</button>
            </div>
          </div>
        </div>
        <div v-if="!assets.length" class="empty">還沒有素材。上傳圖片或影片，發文時從這裡下載（單檔上限 60MB）。</div>
      </section>

      <section class="card">
        <h2>文案</h2>
        <div class="col divided" style="gap: 14px">
          <div v-for="t in post.targets" :key="t.id" class="col" style="gap: 10px">
            <div class="row between">
              <h3>{{ platformLabel(t.accountId) }} 版<span class="small muted" style="font-weight: 400">　{{ account(t.accountId)?.name }}</span></h3>
              <div class="row">
                <button v-if="captions[t.id] !== t.caption" type="button" class="btn" @click="patchTarget(t, { caption: captions[t.id] }, '文案已儲存')">儲存</button>
                <button type="button" class="btn outline" @click="copyCaption(t)">{{ copied === t.id ? '已複製' : '複製文字' }}</button>
              </div>
            </div>
            <textarea v-model="captions[t.id]" rows="6" maxlength="10000" :aria-label="`${platformLabel(t.accountId)} 文案`" placeholder="這個平台的文案" />
          </div>
        </div>
      </section>
    </div>

    <section class="card" style="gap: 16px">
      <div class="col">
        <h2>發文狀態與成效</h2>
        <div class="small muted" style="font-size: 14px">系統不會代發，也還沒有接上各平台的 API：手動發文後把貼文連結貼回來，成效數字也由你登錄。</div>
      </div>
      <div class="col divided" style="gap: 16px">
        <div v-for="t in post.targets" :key="t.id" class="row between gap-lg">
          <div class="col" style="flex: 1 1 200px">
            <div class="bold">{{ platformLabel(t.accountId) }}</div>
            <div v-if="t.publishedUrl" class="small bold" style="color: var(--ok)">已發文　<a :href="t.publishedUrl" target="_blank" rel="noopener noreferrer">開啟貼文</a></div>
            <div v-else class="small" style="color: var(--text-2)">尚未發文</div>
          </div>
          <div v-if="t.publishedUrl" class="metrics" style="flex: 3 1 420px">
            <div v-for="(label, key) in METRIC_LABELS" :key="key" class="col" style="gap: 2px"><span class="small muted">{{ label }}</span><b>{{ fmtNum(t[key]) }}</b></div>
          </div>
          <div class="row">
            <button type="button" class="btn" @click="openLink(t)">{{ t.publishedUrl ? '改連結' : '我已發文，貼上連結' }}</button>
            <button v-if="t.publishedUrl" type="button" class="btn" @click="openMetrics(t)">登錄成效</button>
            <button v-else type="button" class="btn" @click="editOpen = true">改時間</button>
          </div>
        </div>
      </div>
    </section>

    <PostForm v-model="editOpen" :post="post" @saved="p => { apply(p); refreshBoot() }" />
    <AppDialog v-model="linkOpen" title="貼上貼文連結" :error="dialogError" @submit="saveLink">
      <label class="field">{{ linkFor && platformLabel(linkFor.accountId) }} 的貼文連結（清空表示還沒發）
        <input v-model="linkUrl" type="url" placeholder="https://">
      </label>
    </AppDialog>
    <AppDialog v-model="metricsOpen" title="登錄成效" :error="dialogError" @submit="saveMetrics">
      <div class="note">{{ metricsFor && platformLabel(metricsFor.accountId) }}：填入平台後台目前看到的累計數字。</div>
      <div class="metrics">
        <label v-for="(label, key) in METRIC_LABELS" :key="key" class="field">{{ label }}
          <input v-model.number="metrics[key]" type="number" min="0" step="1" required>
        </label>
      </div>
    </AppDialog>
  </template>
  <div v-else class="empty">載入中…</div>
</template>
