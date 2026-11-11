<script setup lang="ts">
// 公開頁面的樣子。對外的 /p/<代號> 與編輯畫面的預覽用同一個元件，所以預覽看到的就是發布後的樣子。
// 版面是單欄、格子自動換行，同一份在手機與電腦上都適用；顏色全部來自 pageColors 算出來的 CSS 變數。
const props = defineProps<{ view: PageView, animate?: boolean }>()
const colors = computed(() => pageColors(props.view))

// 數字從 0 跑到實際數值。只在對外的頁面跑（預覽每改一下就重畫，一直跑會很煩），也尊重「減少動態效果」
const progress = ref(props.animate ? 0 : 1)
onMounted(() => {
  if (!props.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    progress.value = 1
    return
  }
  const start = performance.now()
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / 1100)
    progress.value = 1 - (1 - t) ** 3
    if (t < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})
const num = (n: number) => Math.round(n * progress.value).toLocaleString('en-US')
const unitOf = (platform: Platform) => (platform === 'youtube' ? '訂閱' : platform === 'facebook' ? '追蹤' : '粉絲')
// Threads 的商標是黑色，在深色背景上看不見：跟著文字色走
const iconColor = (platform: Platform) => (platform === 'threads' ? 'var(--pg-ink)' : PLATFORM_ICONS[platform].color)
const initial = computed(() => (props.view.name.trim()[0] ?? '?').toUpperCase())
</script>

<template>
  <div class="pg" :class="{ 'pg-animate': animate }" :style="colors">
    <div v-if="view.coverUrl" class="pg-cover" :style="{ backgroundImage: `url('${view.coverUrl}')` }" aria-hidden="true" />
    <div class="pg-inner">
      <template v-for="(block, i) in view.blocks" :key="block">
        <header v-if="block === 'profile'" class="pg-hero pg-in" :style="{ '--i': i }">
          <div class="pg-hero-top">
            <img v-if="view.avatarUrl" class="pg-avatar" :src="view.avatarUrl" alt="">
            <div v-else class="pg-avatar" aria-hidden="true">{{ initial }}</div>
            <div class="pg-hero-name">
              <span class="pg-kicker">CREATOR</span>
              <h1>{{ view.name }}</h1>
            </div>
          </div>
          <p v-if="view.bio" class="pg-bio">{{ view.bio }}</p>
        </header>

        <section v-else-if="block === 'accounts' && view.accounts.length" class="pg-grid pg-grid-sm pg-in" :style="{ '--i': i }" aria-label="社群帳號">
          <a v-for="a in view.accounts" :key="a.url" class="pg-card pg-account" :href="a.url" target="_blank" rel="noopener noreferrer">
            <span class="pg-label"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path :d="PLATFORM_ICONS[a.platform].path" :fill="iconColor(a.platform)" /></svg>{{ PLATFORMS[a.platform].label }}</span>
            <span v-if="a.followers != null" class="pg-big">{{ num(a.followers) }}</span>
            <span class="pg-small">{{ a.followers != null ? `${unitOf(a.platform)} · ` : '' }}{{ a.name }}</span>
          </a>
        </section>

        <section v-else-if="block === 'stats' && view.stats" class="pg-stats pg-in" :style="{ '--i': i }" aria-label="近 28 天成效">
          <span class="pg-stats-label">LAST 28 DAYS</span>
          <div class="pg-grid pg-grid-xs">
            <div><span class="pg-huge">{{ num(view.stats.views) }}</span><span class="pg-stats-small">觀看</span></div>
            <div><span class="pg-huge">{{ view.stats.rate }}</span><span class="pg-stats-small">互動率</span></div>
            <div><span class="pg-huge">{{ num(view.stats.posts) }}</span><span class="pg-stats-small">則發文</span></div>
          </div>
        </section>

        <section v-else-if="block === 'posts' && view.posts.length" class="pg-section pg-in" :style="{ '--i': i }" aria-label="精選貼文">
          <h2>精選貼文</h2>
          <div class="pg-grid">
            <component :is="p.url ? 'a' : 'div'" v-for="p in view.posts" :key="p.url + p.text" class="pg-card pg-post" :href="p.url || undefined" target="_blank" rel="noopener noreferrer">
              <span class="pg-label"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path :d="PLATFORM_ICONS[p.platform].path" :fill="iconColor(p.platform)" /></svg>{{ PLATFORMS[p.platform].label }} · {{ p.day }}</span>
              <span class="pg-post-text">{{ p.text || '（沒有文字的貼文）' }}</span>
              <span class="pg-post-foot"><span class="pg-post-num">{{ num(p.views) }}</span><span class="pg-small">觀看 · 互動率 {{ p.rate }}</span></span>
            </component>
          </div>
        </section>

        <section v-else-if="block === 'series' && view.series.length" class="pg-section pg-in" :style="{ '--i': i }" aria-label="系列文">
          <h2>系列文</h2>
          <div class="pg-card pg-rows">
            <div v-for="s in view.series" :key="s.name" class="pg-row">
              <span class="pg-row-name">{{ s.name }}</span>
              <span class="pg-small">{{ s.posts }} 則貼文 · 觀看 {{ num(s.views) }}</span>
            </div>
          </div>
        </section>

        <section v-else-if="block === 'text' && (view.textTitle || view.textBody)" class="pg-card pg-text pg-in" :style="{ '--i': i }">
          <h2 v-if="view.textTitle">{{ view.textTitle }}</h2>
          <p v-if="view.textBody">{{ view.textBody }}</p>
        </section>

        <section v-else-if="block === 'links' && view.links.length" class="pg-grid pg-in" :style="{ '--i': i }" aria-label="連結">
          <a v-for="(l, li) in view.links" :key="l.url + l.label" class="pg-cta" :class="{ ghost: li > 0 }" :href="l.url" target="_blank" rel="noopener noreferrer"><span>{{ l.label }}</span><span aria-hidden="true">→</span></a>
        </section>
      </template>
      <p class="pg-footer">數字每天更新 · 由 OpenContentCreator 製作</p>
    </div>
  </div>
</template>

<style scoped>
/* container-type：裡面的字級依「這個元件自己的寬度」調整，不是依視窗，編輯畫面裡的手機預覽才會跟真的手機一樣 */
.pg { container-type: inline-size; position: relative; box-sizing: border-box; min-height: 100%; padding: 28px 16px 56px; color: var(--pg-ink); font-family: 'Noto Sans TC', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang TC', 'Microsoft JhengHei', sans-serif; font-size: 16px; line-height: 1.65; background-color: var(--pg-bg); background-image: linear-gradient(var(--pg-grid) 1px, transparent 1px), linear-gradient(90deg, var(--pg-grid) 1px, transparent 1px); background-size: 36px 36px; overflow: hidden; }
/* 背景圖鋪在最底層，上面蓋一層背景色的漸層遮罩：上方透一點看得到照片，往下變實，字才讀得清楚 */
.pg-cover { position: absolute; inset: 0 0 auto 0; height: 520px; background-size: cover; background-position: center; }
.pg-cover::after { content: ''; position: absolute; inset: 0; background: linear-gradient(color-mix(in srgb, var(--pg-bg) 55%, transparent), color-mix(in srgb, var(--pg-bg) 88%, transparent) 60%, var(--pg-bg)); }
.pg-inner { position: relative; max-width: 900px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
.pg h1, .pg h2, .pg p { margin: 0; }
.pg a { color: inherit; text-decoration: none; }
.pg-card { box-sizing: border-box; background: var(--pg-card); border: 1px solid var(--pg-line); border-radius: 24px; }
.pg-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
.pg-grid-sm { grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
.pg-grid-xs { grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 14px 24px; }
.pg-grid-xs > div { display: flex; flex-direction: column; }
.pg-section { display: flex; flex-direction: column; gap: 12px; }
.pg-section h2, .pg-text h2 { font-size: 24px; font-weight: 900; padding: 0 4px; }

.pg-hero { box-sizing: border-box; border-radius: 32px; border: 1px solid var(--pg-line); background: var(--pg-hero); padding: 40px 28px 30px; display: flex; flex-direction: column; gap: 18px; }
.pg-hero-top { display: flex; flex-wrap: wrap; gap: 20px 26px; align-items: flex-end; }
.pg-avatar { flex: none; width: 112px; height: 112px; border-radius: 32px; object-fit: cover; background: var(--pg-accent); color: var(--pg-on-accent); display: flex; align-items: center; justify-content: center; font-size: 52px; font-weight: 900; box-shadow: 0 0 0 6px var(--pg-bg), 0 0 0 8px var(--pg-accent); }
.pg-hero-name { flex: 1 1 260px; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.pg-kicker { font-size: 13px; font-weight: 900; letter-spacing: 0.28em; color: var(--pg-accent-text); }
.pg-hero h1 { font-size: 44px; font-weight: 900; line-height: 1.15; letter-spacing: -0.01em; overflow-wrap: anywhere; }
.pg-bio { max-width: 640px; font-size: 18px; color: var(--pg-muted); overflow-wrap: anywhere; white-space: pre-line; }

.pg-account { display: flex; flex-direction: column; gap: 2px; padding: 18px 20px; min-height: 44px; border-bottom: 4px solid var(--pg-accent); }
.pg-label { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; color: var(--pg-accent-text); }
.pg-label svg { flex: none; }
.pg-big { font-size: 34px; font-weight: 900; line-height: 1.2; font-variant-numeric: tabular-nums; }
.pg-small { font-size: 14px; color: var(--pg-muted); overflow-wrap: anywhere; }

.pg-stats { box-sizing: border-box; border-radius: 28px; background: var(--pg-accent); color: var(--pg-on-accent); padding: 26px 28px; display: flex; flex-direction: column; gap: 12px; }
.pg-stats-label { font-size: 13px; font-weight: 900; letter-spacing: 0.28em; }
.pg-huge { font-size: 52px; font-weight: 900; line-height: 1.05; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.pg-stats-small { font-size: 15px; font-weight: 700; }

.pg-post { display: flex; flex-direction: column; gap: 10px; padding: 20px 22px; min-height: 190px; }
.pg-post-text { font-size: 19px; font-weight: 700; line-height: 1.45; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
.pg-post-foot { display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: baseline; margin-top: auto; }
.pg-post-num { font-size: 26px; font-weight: 900; color: var(--pg-accent-text); font-variant-numeric: tabular-nums; }

.pg-rows { padding: 10px 24px; }
.pg-row { display: flex; flex-wrap: wrap; gap: 4px 16px; align-items: baseline; justify-content: space-between; padding: 12px 0; }
.pg-row + .pg-row { border-top: 1px solid var(--pg-line); }
.pg-row-name { font-size: 18px; font-weight: 700; overflow-wrap: anywhere; }

.pg-text { padding: 22px 24px; display: flex; flex-direction: column; gap: 8px; }
.pg-text h2 { padding: 0; }
.pg-text p { font-size: 17px; color: var(--pg-muted); overflow-wrap: anywhere; white-space: pre-line; }

.pg-cta { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 64px; padding: 0 26px; border-radius: 999px; background: var(--pg-accent); color: var(--pg-on-accent) !important; font-size: 18px; font-weight: 900; overflow-wrap: anywhere; }
.pg-cta.ghost { background: transparent; border: 2px solid var(--pg-accent); color: var(--pg-accent-text) !important; }
.pg-footer { margin-top: 10px !important; text-align: center; font-size: 13px; color: var(--pg-muted); }

/* 滑過時微微浮起 */
.pg-account, .pg-post, .pg-cta { transition: transform 0.18s ease, border-color 0.18s ease; }
.pg-account:hover, a.pg-post:hover, .pg-cta:hover { transform: translateY(-3px); border-color: var(--pg-accent); }
.pg a:focus-visible { outline: 3px solid var(--pg-accent); outline-offset: 3px; }

/* 進場：各區塊依序淡入上移（只在對外的頁面） */
.pg-animate .pg-in { animation: pg-rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) both; animation-delay: calc(var(--i, 0) * 80ms); }
@keyframes pg-rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .pg-animate .pg-in { animation: none; }
  .pg-account, .pg-post, .pg-cta { transition: none; }
  .pg-account:hover, a.pg-post:hover, .pg-cta:hover { transform: none; }
}
/* 窄螢幕：大字縮一級，免得名字一行只塞得下三四個字 */
@container (max-width: 520px) {
  .pg-hero { padding: 28px 20px 24px; border-radius: 26px; }
  .pg-hero h1 { font-size: 32px; }
  .pg-avatar { width: 88px; height: 88px; border-radius: 26px; font-size: 40px; }
  .pg-huge { font-size: 40px; }
  .pg-bio { font-size: 16px; }
}
</style>
