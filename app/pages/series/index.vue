<script setup lang="ts">
// 系列文管理：每個系列文一張卡片，整張可以點，進去就是成效（設定在成效頁用視窗開）
const { accountLabel } = useLookup()
const series = ref<Series[]>([])
const loaded = ref(false)
const createOpen = ref(false)
async function load() {
  series.value = await attempt(() => api<Series[]>('/api/series')) ?? []
  loaded.value = true
}
onMounted(load)
const trigger = (s: Series) => (s.matchType === 'any' ? '任何留言' : `留言含「${s.keywords}」`)
</script>

<template>
  <div class="row" style="justify-content: flex-end">
    <button type="button" class="btn primary" @click="createOpen = true">新增系列文</button>
  </div>

  <NuxtLink v-for="s in series" :key="s.id" :to="`/series/${s.id}`" class="card card-link" :aria-label="`系列文 ${s.name}`">
    <h2>{{ s.name }}</h2>
    <div class="grid-2" style="gap: 12px 24px">
      <div class="col" style="gap: 6px">
        <span class="small bold muted">貼文</span>
        <div v-for="p in s.posts" :key="p.id" class="row" style="flex-wrap: nowrap; align-items: baseline; font-size: 14px">
          <span class="pl" style="white-space: nowrap">{{ accountLabel(p.accountId).split(' · ')[0] }}</span>
          <span class="wrap-any grow">{{ p.text || '（沒有文字的貼文）' }}</span>
        </div>
        <span v-if="!s.posts.length" class="small muted">還沒有貼文</span>
      </div>
      <div v-if="s.replies.length" class="col" style="gap: 6px; font-size: 14px">
        <span class="small bold muted">留言後</span>
        <span>{{ trigger(s) }}</span>
        <span>回覆：{{ s.replies.length }} 句{{ s.replies.length > 1 ? '輪流' : '' }}</span>
        <span class="wrap-any">私訊：{{ s.dmText ? s.dmText.split('\n')[0] : '不私訊' }}</span>
      </div>
    </div>
  </NuxtLink>
  <div v-if="loaded && !series.length" class="card empty">還沒有系列文</div>

  <SeriesDialog v-model="createOpen" @saved="load" />
</template>
