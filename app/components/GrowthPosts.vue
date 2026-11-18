<script setup lang="ts">
// 粉絲成長裡某段期間發的貼文（由舊到新）：日期、開頭幾個字、觀看、互動，點了到平台上看
defineProps<{ posts: GrowthPost[] }>()
</script>

<template>
  <div class="gp-posts">
    <a v-for="p in posts" :key="p.url + p.published" class="gp-post" :href="p.url || undefined" target="_blank" rel="noopener">
      <span class="muted">{{ fmtDay(p.published) }}</span>
      <span class="ellipsis">{{ p.text || '（沒有文字）' }}</span>
      <span class="num">{{ fmtNum(p.views) }} 觀看</span>
      <span class="num muted">{{ fmtNum(p.engagement) }} 互動</span>
    </a>
    <div v-if="!posts.length" class="small muted" style="padding: 8px 4px">這段期間沒有發文</div>
  </div>
</template>
