<script setup lang="ts">
const boot = useBoot()
const { projectStyle, projectLabel, platformLabel, account } = useLookup()
const route = useRoute()
const weekStart = ref(mondayOf(typeof route.query.w === 'string' && DAY_RE.test(route.query.w) ? route.query.w : todayTaipei()))
const posts = ref<Post[]>([])
const groupFilter = ref<number | 'all'>('all')
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
  (groupFilter.value === 'all' || p.groupId === groupFilter.value)
  && (platformFilter.value === 'all' || p.targets.some(t => account(t.accountId)?.platform === platformFilter.value))))
const days = computed(() => WEEKDAYS.map((name, i) => {
  const day = addDays(weekStart.value, i)
  return { day, label: `週${name}`, date: fmtDay(day), posts: shown.value.filter(p => p.scheduledAt.startsWith(day)) }
}))
const count = (k: string) => shown.value.filter(p => kind(p) === k).length
const usedPlatforms = computed(() => PLATFORM_KEYS.filter(k => boot.value.groups.some(g => g.accounts.some(a => a.platform === k))))

function saved() {
  load()
  refreshBoot()
}
</script>

<template>
  <div class="row between gap-lg">
    <div class="col">
      <p class="en-label">Schedule · 排程週曆</p>
      <h1>排程</h1>
      <div class="muted">{{ weekStart.slice(0, 4) }}/{{ fmtDayFull(weekStart) }}– {{ fmtDayFull(addDays(weekStart, 6)) }}</div>
    </div>
    <div class="row">
      <button type="button" class="btn" @click="weekStart = addDays(weekStart, -7)">上一週</button>
      <button type="button" class="btn" :disabled="weekStart === mondayOf(today)" @click="weekStart = mondayOf(today)">本週</button>
      <button type="button" class="btn" @click="weekStart = addDays(weekStart, 7)">下一週</button>
      <button type="button" class="btn primary" @click="formOpen = true">新增規劃</button>
    </div>
  </div>

  <div class="stats" style="grid-template-columns: repeat(3, minmax(0, 1fr))">
    <div class="stat"><span class="small muted">已規劃</span><b>{{ count('ok') }} 則</b></div>
    <div class="stat"><span class="small muted">待確認的專案提案</span><b>{{ count('pending') }} 則</b></div>
    <div class="stat"><span class="small muted">時段衝突</span><b :style="count('conflict') ? 'color: var(--danger)' : ''">{{ count('conflict') }} 則</b></div>
  </div>

  <div class="row between gap-lg">
    <div class="row" role="group" aria-label="群組與平台篩選">
      <button type="button" class="chip" :aria-pressed="groupFilter === 'all'" @click="groupFilter = 'all'">全部群組</button>
      <button v-for="g in boot.groups" :key="g.id" type="button" class="chip" :aria-pressed="groupFilter === g.id" @click="groupFilter = g.id">{{ g.name }}</button>
      <span class="sep" aria-hidden="true" />
      <button type="button" class="chip" :aria-pressed="platformFilter === 'all'" @click="platformFilter = 'all'">全部平台</button>
      <button v-for="k in usedPlatforms" :key="k" type="button" class="chip" :aria-pressed="platformFilter === k" @click="platformFilter = k">{{ PLATFORMS[k].short }}</button>
    </div>
    <div class="row">
      <span v-for="p in boot.projects" :key="p.id" class="tag lg" :style="projectStyle(p.id)">{{ p.name }}</span>
    </div>
  </div>

  <div class="week-scroll">
    <div class="week">
      <section v-for="d in days" :key="d.day" class="day" :class="{ today: d.day === today }" :aria-label="`${d.label} ${d.date}`">
        <div class="row between" style="align-items: baseline">
          <div class="day-name">{{ d.label }}</div>
          <div class="small muted">{{ d.date }}</div>
        </div>
        <article v-for="p in d.posts" :key="p.id" class="post" :class="kind(p)">
          <div class="row between" style="gap: 6px">
            <span class="bold" style="font-size: 13.5px">{{ p.scheduledAt.slice(11) }}</span>
            <span class="small" :class="`status-${kind(p)}`" style="font-size: 12px">{{ KIND_LABEL[kind(p)] }}</span>
          </div>
          <NuxtLink :to="`/posts/${p.id}`" class="title">{{ p.title }}</NuxtLink>
          <div class="row" style="gap: 4px">
            <span v-for="t in p.targets" :key="t.id" class="pl">{{ platformLabel(t.accountId, true) }}{{ t.publishedUrl ? ' ✓' : '' }}</span>
          </div>
          <span class="tag" style="align-self: flex-start" :style="projectStyle(p.projectId)">{{ projectLabel(p) }}</span>
        </article>
      </section>
    </div>
  </div>

  <div class="card" style="flex-direction: row; flex-wrap: wrap; align-items: center; justify-content: space-between; padding: 16px 20px">
    <div class="grow note" style="flex-basis: 420px">這份排程是發文計畫，系統不會代發：點貼文標題可以進去下載素材、複製文案，發出後把連結貼回來並登錄成效。虛線卡片是其他專案透過 MCP 送來的提案，確認後才會進入排程；紅色卡片與同一個帳號的既有貼文撞期。不同群組的帳號各自計算，不會互相撞期。</div>
    <NuxtLink to="/connections" class="btn outline">前往處理提案</NuxtLink>
  </div>

  <PostForm v-model="formOpen" :default-day="weekStart <= today && today <= addDays(weekStart, 6) ? today : weekStart" @saved="saved" />
</template>
