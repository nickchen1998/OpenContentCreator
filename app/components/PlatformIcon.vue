<script setup lang="ts">
// 平台商標。預設只有圖示（平台名稱給螢幕閱讀器念）；加 label 會在旁邊寫出平台名稱，short 用縮寫
const props = defineProps<{ platform?: Platform, label?: boolean, short?: boolean, size?: number }>()
const name = computed(() => props.platform ? PLATFORMS[props.platform][props.short ? 'short' : 'label'] : '已刪除')
</script>

<template>
  <span class="pf">
    <svg v-if="platform" class="pf-icon" viewBox="0 0 24 24" :width="size ?? 16" :height="size ?? 16" aria-hidden="true" :style="{ '--brand': PLATFORM_ICONS[platform].color }">
      <path :d="PLATFORM_ICONS[platform].path" fill="currentColor" />
    </svg>
    <span v-if="label || !platform">{{ name }}</span>
    <span v-else class="sr-only">{{ name }}</span>
  </span>
</template>
