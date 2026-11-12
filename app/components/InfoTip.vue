<script setup lang="ts">
// 設定旁邊的小「i」：滑鼠移上去或用鍵盤聚焦時顯示一句說明。畫面上平常不放說明文字，真的需要解釋的才用這個
defineProps<{ text: string }>()
const id = useId()
</script>

<template>
  <span class="info-tip">
    <button type="button" class="info-tip-btn" aria-label="說明" :aria-describedby="id">i</button>
    <span :id="id" role="tooltip" class="info-tip-body">{{ text }}</span>
  </span>
</template>
