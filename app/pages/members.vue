<script setup lang="ts">
// 設定已經收進使用者選單開的視窗；舊網址（含 Google 授權完回來的 /accounts?youtube=…）導回儀表板並打開視窗
onMounted(() => openSetupFromRoute('members'))
</script>

<template>
  <div />
</template>
