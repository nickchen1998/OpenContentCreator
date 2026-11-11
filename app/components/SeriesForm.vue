<script setup lang="ts">
// 新增或設定一個系列文：名稱、包含哪些貼文、有人留言時怎麼回
const props = defineProps<{ series?: Series }>()
const { accounts, accountLabel } = useLookup()
type Candidate = InsightPost & { seriesId: number | null, seriesName: string | null }
const candidates = ref<Candidate[]>([])
const form = reactive({
  name: props.series?.name ?? '',
  postIds: props.series?.posts.map(p => p.id) ?? [] as number[],
  matchType: props.series?.matchType ?? 'any' as 'any' | 'keyword',
  keywords: props.series?.keywords ?? '',
  repliesText: props.series?.replies.join('\n') ?? '',
  dmOn: Boolean(props.series?.dmText),
  dmText: props.series?.dmText ?? '',
  enabled: props.series?.enabled ?? true,
})
const tab = ref<number | 'all'>('all')
const error = ref('')
const busy = ref(false)

onMounted(async () => (candidates.value = await attempt(() => api<Candidate[]>('/api/series/candidates')) ?? []))
// 已經在別的系列文裡的貼文不能再勾（一則貼文只能屬於一個系列文）
const locked = (p: Candidate) => p.seriesId != null && p.seriesId !== props.series?.id
const shown = computed(() => candidates.value.filter(p => tab.value === 'all' || p.accountId === tab.value))
const usedAccounts = computed(() => accounts.value.filter(a => candidates.value.some(p => p.accountId === a.id)))
const dayOf = (iso: string) => fmtDay(minutesToAt(Math.floor(Date.parse(iso) / 60000) + 480).slice(0, 10))

async function save() {
  busy.value = true
  error.value = ''
  const body = {
    name: form.name, postIds: form.postIds, matchType: form.matchType, keywords: form.keywords, enabled: form.enabled,
    replies: form.repliesText.split('\n').map(s => s.trim()).filter(Boolean),
    dmText: form.dmOn ? form.dmText : '',
  }
  try {
    if (props.series) await api(`/api/series/${props.series.id}`, { method: 'PATCH', body })
    else await api('/api/series', { method: 'POST', body })
    notify('已儲存')
    await navigateTo('/series')
  }
  catch (e: any) {
    error.value = e.message
  }
  busy.value = false
}
async function remove() {
  if (!confirm(`刪除系列文「${props.series!.name}」？貼文本身不會被刪除，但這些貼文的留言不會再自動回覆。`)) return
  if (await attempt(() => api(`/api/series/${props.series!.id}`, { method: 'DELETE' }), '已刪除')) await navigateTo('/series')
}
</script>

<template>
  <form style="display: contents" @submit.prevent="save">
    <div class="row between">
      <NuxtLink to="/series" class="btn-text" style="padding-left: 0">← 系列文管理</NuxtLink>
      <div class="row">
        <NuxtLink v-if="series" :to="`/series/${series.id}`" class="btn">看成效</NuxtLink>
        <button type="submit" class="btn primary" :disabled="busy">儲存</button>
      </div>
    </div>
    <div v-if="error" class="card" style="background: var(--danger-bg); border-color: var(--danger)" role="alert"><span class="small">{{ error }}</span></div>

    <section class="card">
      <label class="field">系列文名稱
        <input v-model="form.name" type="text" maxlength="40" required>
      </label>
    </section>

    <div class="grid-2">
      <section class="card">
        <div class="row between">
          <h2>貼文</h2>
          <span class="small muted">已選 {{ form.postIds.length }} 則</span>
        </div>
        <div v-if="usedAccounts.length > 1" class="row" role="group" aria-label="帳號">
          <button type="button" class="chip" :aria-pressed="tab === 'all'" @click="tab = 'all'">全部</button>
          <button v-for="a in usedAccounts" :key="a.id" type="button" class="chip" :aria-pressed="tab === a.id" @click="tab = a.id">{{ PLATFORMS[a.platform].label }}</button>
        </div>
        <div class="col divided" style="gap: 12px">
          <label v-for="p in shown" :key="p.id" class="row" style="flex-wrap: nowrap; align-items: flex-start; gap: 12px; min-height: 44px" :style="locked(p) ? 'opacity: .55' : 'cursor: pointer'">
            <input v-model="form.postIds" type="checkbox" :value="p.id" :disabled="locked(p)" style="width: 18px; height: 18px; margin-top: 4px; accent-color: var(--green-deep); flex-shrink: 0">
            <span class="col grow" style="gap: 2px">
              <span class="wrap-any">{{ p.text || '（沒有文字的貼文）' }}</span>
              <span class="small muted">{{ accountLabel(p.accountId).split(' · ')[0] }} · {{ dayOf(p.publishedAt) }}<template v-if="locked(p)"> · 已在「{{ p.seriesName }}」</template></span>
            </span>
          </label>
        </div>
        <div v-if="!candidates.length" class="empty">還沒有貼文　<NuxtLink to="/accounts">連結帳號</NuxtLink></div>
      </section>

      <section class="card" style="gap: 14px">
        <div class="row between">
          <h2>有人留言時</h2>
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
        <label class="check"><input v-model="form.dmOn" type="checkbox">同時私訊留言者</label>
        <label v-if="form.dmOn" class="field">私訊內容
          <textarea v-model="form.dmText" rows="4" maxlength="1000" required />
        </label>
      </section>
    </div>

    <div v-if="series" class="row">
      <button type="button" class="btn danger" @click="remove">刪除系列文</button>
    </div>
  </form>
</template>
