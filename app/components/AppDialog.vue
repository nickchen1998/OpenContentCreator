<script setup lang="ts">
// 原生 <dialog>：有 focus trap、Esc 關閉。v-model 控制開關，submit 事件交給外面存檔
const open = defineModel<boolean>({ required: true })
defineProps<{ title: string, submitLabel?: string, error?: string, busy?: boolean, wide?: boolean }>()
defineEmits<{ submit: [] }>()
const el = ref<HTMLDialogElement>()
watch(open, (value) => {
  if (value) el.value?.showModal()
  else el.value?.close()
})
</script>

<template>
  <dialog ref="el" :class="{ wide }" @close="open = false">
    <form v-if="open" @submit.prevent="$emit('submit')">
      <h2>{{ title }}</h2>
      <slot />
      <div v-if="error" class="error" role="alert">{{ error }}</div>
      <div class="row" style="justify-content: flex-end">
        <slot name="actions" />
        <button type="button" class="btn" @click="open = false">取消</button>
        <button v-if="submitLabel !== ''" type="submit" class="btn primary" :disabled="busy">{{ submitLabel ?? '儲存' }}</button>
      </div>
    </form>
  </dialog>
</template>
