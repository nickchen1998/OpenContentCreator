<script setup lang="ts">
const boot = useBoot()
const { accountLabel, group } = useLookup()
const days = ref(28)
const posts = ref<Post[]>([])

async function load() {
  const today = todayTaipei()
  posts.value = await attempt(() => api<Post[]>('/api/posts', { query: { from: addDays(today, -days.value), to: today } })) ?? []
}
watch(days, load, { immediate: true })

const summary = computed(() => summarizeInsights(posts.value, boot.value))
const rate = (eng: number, views: number) => (views ? `${(eng / views * 100).toFixed(1)}%` : '—')
const maxViews = computed(() => Math.max(1, ...summary.value.rows.map(r => r.views)))
const maxGroupViews = computed(() => Math.max(1, ...summary.value.groups.map(g => g.views)))
const share = (views: number) => (summary.value.totals.views ? `${Math.round(views / summary.value.totals.views * 100)}%` : '0%')
const GROUP_COLORS = ['#1F4FA3', '#0F5C55', '#7A4300', '#4B2FA3', '#8A1F52']
</script>

<template>
  <div class="row between gap-lg">
    <div class="col">
      <h1>成效總覽</h1>
      <div class="muted">近 {{ days }} 天，{{ boot.groups.length }} 個群組、{{ summary.rows.length }} 個帳號合併。只計入已貼上連結的貼文，數字來自你在貼文頁登錄的成效。</div>
    </div>
    <div class="row" role="group" aria-label="期間">
      <button type="button" class="chip" :aria-pressed="days === 7" @click="days = 7">近 7 天</button>
      <button type="button" class="chip" :aria-pressed="days === 28" @click="days = 28">近 28 天</button>
      <button type="button" class="chip" :aria-pressed="days === 90" @click="days = 90">近 90 天</button>
    </div>
  </div>

  <div class="stats">
    <div class="stat"><span class="small muted">總觀看</span><b>{{ fmtNum(summary.totals.views) }}</b></div>
    <div class="stat"><span class="small muted">總互動</span><b>{{ fmtNum(summary.totals.engagement) }}</b></div>
    <div class="stat"><span class="small muted">平均互動率</span><b>{{ rate(summary.totals.engagement, summary.totals.views) }}</b></div>
    <div class="stat"><span class="small muted">收藏</span><b>{{ fmtNum(summary.totals.saves) }}</b></div>
    <div class="stat"><span class="small muted">發文數</span><b>{{ summary.totals.posts }} 則</b></div>
  </div>

  <section class="card">
    <h2>各帳號比較</h2>
    <div class="table-scroll">
      <table style="min-width: 720px">
        <thead>
          <tr><th scope="col">群組 · 帳號</th><th scope="col">發文</th><th scope="col">觀看</th><th scope="col">觀看占比</th><th scope="col">互動</th><th scope="col">互動率</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in summary.rows" :key="r.accountId">
            <th scope="row">{{ r.groupName }} · {{ PLATFORMS[r.platform].label }}<div class="small muted" style="font-weight: 400">{{ r.name }}</div></th>
            <td>{{ r.posts }}</td>
            <td>{{ fmtNum(r.views) }}</td>
            <td><div class="bar-track" aria-hidden="true"><div class="bar" :style="{ width: `${Math.round(r.views / maxViews * 100)}%` }" /></div></td>
            <td>{{ fmtNum(r.engagement) }}</td>
            <td>{{ rate(r.engagement, r.views) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="!summary.rows.length" class="empty">還沒有帳號。</div>
  </section>

  <div class="grid-2">
    <section class="card">
      <h2>表現最好的貼文</h2>
      <div class="col divided" style="gap: 14px">
        <div v-for="t in summary.top" :key="`${t.postId}-${t.accountId}`" class="row between" style="flex-wrap: nowrap; gap: 12px">
          <div class="col grow">
            <NuxtLink :to="`/posts/${t.postId}`" class="bold" style="color: var(--text)">{{ t.title }}</NuxtLink>
            <div class="small muted">{{ accountLabel(t.accountId) }}</div>
          </div>
          <div class="col" style="text-align: right; white-space: nowrap">
            <div class="bold">{{ fmtNum(t.views) }} 觀看</div>
            <div class="small muted">{{ fmtNum(t.engagement) }} 互動</div>
          </div>
        </div>
      </div>
      <div v-if="!summary.top.length" class="empty">這段期間還沒有已發出的貼文。到貼文頁貼上連結並登錄成效後，這裡就會有數字。</div>
    </section>
    <section class="card">
      <h2>各群組的觀看</h2>
      <div v-for="(g, i) in summary.groups" :key="g.groupId" class="col" style="gap: 6px">
        <div class="row between"><span class="bold">{{ group(g.groupId)?.name }}</span><span>{{ fmtNum(g.views) }}（{{ share(g.views) }}）</span></div>
        <div class="bar-track" aria-hidden="true"><div class="bar" :style="{ width: `${Math.round(g.views / maxGroupViews * 100)}%`, background: GROUP_COLORS[i % GROUP_COLORS.length] }" /></div>
      </div>
      <h2 style="margin-top: 8px">指標怎麼合併</h2>
      <div class="note">觀看：各平台都以「觀看數」為準。<br>互動：按讚、留言、分享相加。<br>互動率：互動除以觀看。<br>期間以貼文的預計發文時間計算。</div>
    </section>
  </div>
</template>
