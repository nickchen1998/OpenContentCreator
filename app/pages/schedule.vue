<script setup lang="ts">
const boot = useBoot()
const { projectStyle, projectLabel, account } = useLookup()
const route = useRoute()
const weekStart = ref(mondayOf(typeof route.query.w === 'string' && DAY_RE.test(route.query.w) ? route.query.w : todayTaipei()))
const posts = ref<Post[]>([])
const platformFilter = ref<Platform | 'all'>('all')
const formOpen = ref(false)
const today = todayTaipei()

async function load() {
  const list = await attempt(() => api<Post[]>('/api/posts', { query: { from: weekStart.value, to: addDays(weekStart.value, 6) } }))
  // 退回與撤回的提案不放在週曆上
  if (list) posts.value = list.filter(p => p.status === 'scheduled' || p.status === 'pending')
}
watch(weekStart, (w) => {
  navigateTo({ query: { w } }, { replace: true })
  load()
}, { immediate: true })

const kind = (p: Post) => (p.conflicts.length ? 'conflict' : p.status === 'pending' ? 'pending' : 'ok')
const KIND_LABEL = { ok: '已規劃', pending: '待確認', conflict: '時段衝突' }
const shown = computed(() => posts.value.filter(p =>
  platformFilter.value === 'all' || p.targets.some(t => account(t.accountId)?.platform === platformFilter.value)))
const days = computed(() => WEEKDAYS.map((name, i) => {
  const day = addDays(weekStart.value, i)
  return { day, label: `週${name}`, date: fmtDay(day), posts: shown.value.filter(p => p.scheduledAt.startsWith(day)) }
}))
const count = (k: string) => shown.value.filter(p => kind(p) === k).length
const usedPlatforms = computed(() => PLATFORM_KEYS.filter(k => boot.value.accounts.some(a => a.platform === k)))

function saved() {
  load()
  refreshBoot()
}
</script>

<template>
  <div class="row between gap-lg">
    <h2>{{ weekStart.slice(0, 4) }}/{{ fmtDayFull(weekStart) }}– {{ fmtDayFull(addDays(weekStart, 6)) }}</h2>
    <div class="row">
      <button type="button" class="btn" @click="weekStart = addDays(weekStart, -7)">上一週</button>
      <button type="button" class="btn" :disabled="weekStart === mondayOf(today)" @click="weekStart = mondayOf(today)">本週</button>
      <button type="button" class="btn" @click="weekStart = addDays(weekStart, 7)">下一週</button>
      <button type="button" class="btn primary" @click="formOpen = true">新增規劃</button>
    </div>
  </div>

  <div class="stats" style="grid-template-columns: repeat(3, minmax(0, 1fr))">
    <div class="stat"><span class="small muted">已規劃</span><b>{{ count('ok') }} 則</b></div>
    <div class="stat"><span class="small muted">待確認</span><b>{{ count('pending') }} 則</b></div>
    <div class="stat"><span class="small muted">時段衝突</span><b :style="count('conflict') ? 'color: var(--danger)' : ''">{{ count('conflict') }} 則</b></div>
  </div>

  <div class="row between gap-lg">
    <div class="row" role="group" aria-label="平台篩選">
      <button type="button" class="chip" :aria-pressed="platformFilter === 'all'" @click="platformFilter = 'all'">全部平台</button>
      <button v-for="k in usedPlatforms" :key="k" type="button" class="chip" :aria-pressed="platformFilter === k" @click="platformFilter = k"><PlatformIcon :platform="k" short label /></button>
    </div>
    <div class="row">
      <span v-for="p in boot.projects" :key="p.id" class="tag lg" :style="projectStyle(p.id)">{{ p.name }}</span>
    </div>
  </div>

  <div class="week-scroll fill">
    <div class="week">
      <section v-for="d in days" :key="d.day" class="day" :class="{ today: d.day === today }" :aria-label="`${d.label} ${d.date}`">
        <div class="row between" style="align-items: baseline">
          <div class="day-name">{{ d.label }}</div>
          <div class="small muted">{{ d.date }}</div>
        </div>
        <article v-for="p in d.posts" :key="p.id" class="post" :class="kind(p)">
          <div class="row between" style="gap: 6px">
            <span class="bold" style="font-size: 14.5px">{{ p.scheduledAt.slice(11) }}</span>
            <span class="small" :class="`status-${kind(p)}`" style="font-size: 13px">{{ KIND_LABEL[kind(p)] }}</span>
          </div>
          <NuxtLink :to="`/posts/${p.id}`" class="title">{{ p.title }}</NuxtLink>
          <div class="row" style="gap: 8px">
            <span v-for="t in p.targets" :key="t.id" class="pf" style="gap: 2px" :title="t.publishedUrl ? '已發文' : undefined"><PlatformIcon :platform="account(t.accountId)?.platform" :size="15" /><span v-if="t.publishedUrl" class="small bold" style="color: var(--ok)">✓<span class="sr-only">已發文</span></span></span>
          </div>
          <span class="tag" style="align-self: flex-start" :style="projectStyle(p.projectId)">{{ projectLabel(p) }}</span>
        </article>
      </section>
    </div>
  </div>


  <PostForm v-model="formOpen" :default-day="weekStart <= today && today <= addDays(weekStart, 6) ? today : weekStart" @saved="saved" />
</template>
