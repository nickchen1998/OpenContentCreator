<script setup lang="ts">
const id = Number(useRoute().params.id)
const series = ref<Series>()
const missing = ref(false)
onMounted(async () => {
  try {
    series.value = (await api<{ series: Series }>(`/api/series/${id}`)).series
  }
  catch {
    missing.value = true
  }
})
</script>

<template>
  <div v-if="missing" class="empty">找不到這個系列文。<NuxtLink to="/series">返回系列文管理</NuxtLink></div>
  <SeriesForm v-else-if="series" :series="series" />
  <div v-else class="empty">載入中…</div>
</template>
