<script setup lang="ts">
// 系列文管理：每個系列文一張卡片，整張可以點，進去就是成效
const { account } = useLookup()
const series = ref<Series[]>([])
const loaded = ref(false)
const createOpen = ref(false)
async function load() {
  series.value = await attempt(() => api<Series[]>('/api/series')) ?? []
  loaded.value = true
}
onMounted(load)
const rate = (eng: number, views: number) => (views ? `${(eng / views * 100).toFixed(1)}%` : '—')
const cards = computed(() => series.value.map((s) => {
  const totals = totalsOf(s.posts)
  const platforms = [...new Set(s.posts.map(p => account(p.accountId)?.platform).filter(Boolean))] as Platform[]
  return { ...s, totals, platforms }
}))
</script>

<template>
  <div class="row" style="justify-content: flex-end">
    <button type="button" class="btn primary" @click="createOpen = true">新增系列文</button>
  </div>

  <div class="series-grid fill scroll">
    <NuxtLink v-for="s in cards" :key="s.id" :to="`/series/${s.id}`" class="series-card" :aria-label="`系列文 ${s.name}`">
      <div class="series-card-head">
        <h2 class="wrap-any">{{ s.name }}</h2>
        <span class="row" style="gap: 4px; flex-wrap: nowrap">
          <span v-for="p in s.platforms" :key="p" class="pl">{{ PLATFORMS[p].short }}</span>
        </span>
      </div>
      <div class="series-card-main">
        <div class="col" style="gap: 0">
          <b class="series-card-number">{{ fmtNum(s.totals.views) }}</b>
          <span class="small muted">觀看</span>
        </div>
        <div class="col" style="gap: 0; text-align: right">
          <b class="series-card-number">{{ rate(s.totals.engagement, s.totals.views) }}</b>
          <span class="small muted">互動率</span>
        </div>
      </div>
      <dl class="series-card-foot">
        <div><dt>貼文</dt><dd>{{ s.posts.length }}</dd></div>
        <div><dt>留言</dt><dd>{{ fmtNum(s.received) }}</dd></div>
        <div><dt>已回覆</dt><dd>{{ fmtNum(s.replied) }}</dd></div>
        <div><dt>私訊</dt><dd>{{ fmtNum(s.dms) }}</dd></div>
      </dl>
    </NuxtLink>
  </div>
  <div v-if="loaded && !series.length" class="card empty">還沒有系列文</div>

  <SeriesDialog v-model="createOpen" @saved="load" />
</template>
