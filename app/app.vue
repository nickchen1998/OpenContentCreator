<script setup lang="ts">
const toast = useToast()
// 提示訊息要蓋在開著的視窗（原生 dialog，在瀏覽器的最上層）上面：用 popover，每次重新顯示就會排到最上層的最前面
const el = ref<HTMLElement>()
watch(toast, async (message) => {
  await nextTick()
  if (el.value?.matches(':popover-open')) el.value.hidePopover()
  if (message) el.value?.showPopover?.()
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <div ref="el" popover="manual" class="toast" role="status">{{ toast }}</div>
</template>
