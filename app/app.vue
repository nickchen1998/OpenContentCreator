<script setup lang="ts">
const toast = useToast()
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <div v-if="toast" class="toast" role="status">{{ toast }}</div>
</template>
