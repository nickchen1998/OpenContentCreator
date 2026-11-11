<script setup lang="ts">
// 會員對外的公開頁面：不用登入。內容來自 /api/public/<代號>，只有已發布、而且會員打開的區塊
definePageMeta({ layout: false })
const slug = String(useRoute().params.slug ?? '')
const view = ref<PageView>()
const missing = ref(false)

onMounted(async () => {
  try {
    view.value = await $fetch<PageView>(`/api/public/${encodeURIComponent(slug)}`)
  }
  catch {
    missing.value = true
  }
})
// 全站預設不給搜尋引擎收錄；公開頁面是要給人找到的，這一頁改成可以收錄
useHead(() => ({
  // 標題與說明跟伺服器寫進 HTML 的分享預覽一致（server/routes/p/[slug].ts）
  title: view.value?.share.title ?? 'OpenContentCreator',
  meta: [
    { name: 'robots', content: view.value ? 'index, follow' : 'noindex' },
    ...(view.value?.share.text ? [{ name: 'description', content: view.value.share.text }] : []),
  ],
}))
</script>

<template>
  <PublicPageView v-if="view" :view="view" animate style="min-height: 100vh" />
  <div v-else-if="missing" class="empty" style="padding-top: 20vh">找不到這個頁面</div>
</template>
