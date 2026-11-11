<script setup lang="ts">
// 新增或設定系列文的視窗：名稱、包含哪些貼文、有人留言時怎麼回。新增與設定共用
const open = defineModel<boolean>({ required: true })
const props = defineProps<{ series?: Series }>()
const emit = defineEmits<{ saved: [id: number], deleted: [] }>()
const { accounts, accountLabel } = useLookup()
type Candidate = InsightPost & { seriesId: number | null, seriesName: string | null }
const PAGE_SIZE = 8
const candidates = ref<Candidate[]>([])
const form = reactive({ name: '', postIds: [] as number[], matchType: 'any' as 'any' | 'keyword', keywords: '', repliesText: '', dmText: '', enabled: true })
const tab = ref<number | 'all'>('all')
const page = ref(1)
const error = ref('')
const busy = ref(false)
const loading = ref(false)

watch(open, async (value) => {
  if (!value) return
  const s = props.series
  Object.assign(form, {
    name: s?.name ?? '', postIds: s?.posts.map(p => p.id) ?? [], matchType: s?.matchType ?? 'any', keywords: s?.keywords ?? '',
    repliesText: s?.replies.join('\n') ?? '', dmText: s?.dmText ?? '', enabled: s?.enabled ?? true,
  })
  tab.value = 'all'
  page.value = 1
  error.value = ''
  loading.value = true
  candidates.value = await attempt(() => api<Candidate[]>('/api/series/candidates')) ?? []
  loading.value = false
})

// 已經在別的系列文裡的貼文不能再勾（一則貼文只能屬於一個系列文）
const locked = (p: Candidate) => p.seriesId != null && p.seriesId !== props.series?.id
const filtered = computed(() => candidates.value.filter(p => tab.value === 'all' || p.accountId === tab.value))
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const shown = computed(() => filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
const usedAccounts = computed(() => accounts.value.filter(a => candidates.value.some(p => p.accountId === a.id)))
const dayOf = (iso: string) => fmtDay(minutesToAt(Math.floor(Date.parse(iso) / 60000) + 480).slice(0, 10))
const list = ref<HTMLElement>()
function go(to: number | 'all' | null, nextPage = 1) {
  if (to !== null) tab.value = to
  page.value = Math.min(Math.max(1, nextPage), to === null ? pages.value : 9999)
  list.value?.scrollTo({ top: 0 })
}

async function save() {
  busy.value = true
  error.value = ''
  const body = {
    name: form.name, postIds: form.postIds, matchType: form.matchType, keywords: form.keywords, enabled: form.enabled,
    replies: form.repliesText.split('\n').map(s => s.trim()).filter(Boolean),
    dmText: form.dmText.trim(),
  }
  try {
    const id = props.series
      ? (await api(`/api/series/${props.series.id}`, { method: 'PATCH', body }), props.series.id)
      : (await api<{ id: number }>('/api/series', { method: 'POST', body })).id
    open.value = false
    notify('已儲存')
    emit('saved', id)
  }
  catch (e: any) {
    error.value = e.message
  }
  busy.value = false
}
async function remove() {
  if (!confirm(`刪除系列文「${props.series!.name}」？貼文本身不會被刪除，但這些貼文的留言不會再自動回覆。`)) return
  if (await attempt(() => api(`/api/series/${props.series!.id}`, { method: 'DELETE' }), '已刪除')) {
    open.value = false
    emit('deleted')
  }
}
</script>

<template>
  <AppDialog v-model="open" wide :title="series ? '設定系列文' : '新增系列文'" :error="error" :busy="busy" @submit="save">
    <label class="field">系列文名稱
      <input v-model="form.name" type="text" maxlength="40" required>
    </label>

    <div class="series-form">
      <section class="col" style="gap: 10px; min-width: 0">
        <div class="row between">
          <h3>貼文</h3>
          <span class="small muted">已選 {{ form.postIds.length }} 則</span>
        </div>
        <div v-if="usedAccounts.length > 1" class="row" role="group" aria-label="帳號">
          <button type="button" class="chip" :aria-pressed="tab === 'all'" @click="go('all')">全部</button>
          <button v-for="a in usedAccounts" :key="a.id" type="button" class="chip" :aria-pressed="tab === a.id" @click="go(a.id)">{{ PLATFORMS[a.platform].label }}</button>
        </div>
        <!-- 貼文清單在自己的區塊裡捲動，不會把整個視窗撐長 -->
        <div ref="list" class="post-list" tabindex="0" aria-label="可以加入的貼文">
          <label v-for="p in shown" :key="p.id" class="post-option" :class="{ locked: locked(p) }">
            <input v-model="form.postIds" type="checkbox" :value="p.id" :disabled="locked(p)">
            <span class="col grow" style="gap: 2px">
              <span class="wrap-any">{{ p.text || '（沒有文字的貼文）' }}</span>
              <span class="small muted">{{ accountLabel(p.accountId).split(' · ')[0] }} · {{ dayOf(p.publishedAt) }}<template v-if="locked(p)"> · 已在「{{ p.seriesName }}」</template></span>
            </span>
          </label>
          <div v-if="loading" class="empty">載入中…</div>
          <div v-else-if="!candidates.length" class="empty">還沒有貼文　<NuxtLink to="/accounts">連結帳號</NuxtLink></div>
        </div>
        <div v-if="pages > 1" class="row between" role="navigation" aria-label="貼文分頁">
          <button type="button" class="btn sm" :disabled="page <= 1" @click="go(null, page - 1)">上一頁</button>
          <span class="small muted" aria-live="polite">第 {{ page }} / {{ pages }} 頁</span>
          <button type="button" class="btn sm" :disabled="page >= pages" @click="go(null, page + 1)">下一頁</button>
        </div>
      </section>

      <section class="col" style="gap: 12px; min-width: 0">
        <div class="row between">
          <h3>有人留言時</h3>
          <label class="check"><input v-model="form.enabled" type="checkbox">啟用自動回覆</label>
        </div>
        <div class="row" role="group" aria-label="觸發條件">
          <button type="button" class="chip" :aria-pressed="form.matchType === 'any'" @click="form.matchType = 'any'">任何留言</button>
          <button type="button" class="chip" :aria-pressed="form.matchType === 'keyword'" @click="form.matchType = 'keyword'">含關鍵字</button>
        </div>
        <label v-if="form.matchType === 'keyword'" class="field">關鍵字（逗號分隔）
          <input v-model="form.keywords" type="text" maxlength="200">
        </label>
        <label class="field">回覆留言（一行一句，輪流使用）
          <textarea v-model="form.repliesText" rows="4" />
        </label>
        <label class="field">私訊留言者（留空就不私訊）
          <textarea v-model="form.dmText" rows="4" maxlength="1000" />
        </label>
      </section>
    </div>

    <template v-if="series" #actions>
      <button type="button" class="btn danger" style="margin-right: auto" @click="remove">刪除系列文</button>
    </template>
  </AppDialog>
</template>
