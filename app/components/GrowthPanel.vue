<script setup lang="ts">
// 儀表板右邊的「粉絲成長」：裡面不放任何篩選，跟著上方的期間與平台走。所選平台的每個帳號各一塊（不跨帳號加總），
// 只呈現資料、不做原因分析。算法在 shared/utils/growth.ts，MCP 工具用的是同一份
defineProps<{
  accounts: Account[]
  days: number
  /** 各帳號目前的粉絲數與這段期間的增減（紀錄不夠久時 change 是 null） */
  followers: Record<number, { followers: number, change: number | null }>
}>()
</script>

<template>
  <section class="card gp">
    <h2>粉絲成長</h2>
    <div class="gp-list scroll">
      <GrowthAccount v-for="a in accounts" :key="a.id" :account="a" :days="days" :now="followers[a.id]" />
      <div v-if="!accounts.length" class="empty">還沒有帳號</div>
    </div>
  </section>
</template>
