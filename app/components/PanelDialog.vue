<script setup lang="ts">
// 畫面中間的大視窗（設定、粉絲成長）：有標題列與關閉鈕，內容自己排。跟 AppDialog 不同的是沒有表單與「儲存／取消」，
// 所以裡面可以再放表單與 AppDialog（原生 dialog 會疊在上面）
const open = defineModel<boolean>({ required: true })
defineProps<{ title: string, en?: string }>()
const el = ref<HTMLDialogElement>()
const sync = (value: boolean) => (value ? !el.value?.open && el.value?.showModal() : el.value?.close())
watch(open, sync)
onMounted(() => sync(open.value))
</script>

<template>
  <dialog ref="el" class="panel" @close="open = false" @click="$event.target === el && (open = false)">
    <div v-if="open" class="panel-inner">
      <header class="panel-head">
        <slot name="icon" />
        <div class="col" style="gap: 2px">
          <p v-if="en" class="en-label">{{ en }}</p>
          <h2>{{ title }}</h2>
        </div>
        <slot name="head" />
        <button type="button" class="panel-close" aria-label="關閉" @click="open = false">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
        </button>
      </header>
      <div class="panel-body"><slot /></div>
    </div>
  </dialog>
</template>
