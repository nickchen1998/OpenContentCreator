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
// 帶正負號的數字（粉絲成長）；沒有資料時顯示 text
const statText = (item: { n: number | null, text: string, signed: boolean }) => (item.n == null ? item.text : `${item.signed && item.n > 0 ? '+' : ''}${num(item.n)}`)
const signed = (n: number | null) => (n == null ? '—' : `${n > 0 ? '+' : ''}${num(n)}`)
const growthLabel = (platform: Platform) => (platform === 'youtube' ? '訂閱成長' : '粉絲成長')

// 嵌入框（平台的 iframe）的高度：Instagram 與 Threads 會用 postMessage 回報實際高度，收到就照著調；
// 只認「訊息真的來自我們頁面上那個 iframe」而且來源是該平台的，其他訊息一律不理
const root = ref<HTMLElement>()
const heights = reactive<Record<string, number>>({})
function onMessage(event: MessageEvent) {
  const frame = [...(root.value?.querySelectorAll<HTMLIFrameElement>('iframe[data-embed]') ?? [])].find(f => f.contentWindow === event.source)
  const height = frame ? embedHeightOf(event.origin, event.data) : 0
  if (frame && height) heights[frame.dataset.embed!] = height
}
onMounted(() => window.addEventListener('message', onMessage))
onBeforeUnmount(() => window.removeEventListener('message', onMessage))
const frameStyle = (embed: PageEmbed) => (embed.platform === 'youtube' ? { aspectRatio: '16 / 9' } : { height: `${heights[embed.src] ?? embed.height}px` })
// 窄螢幕上精選貼文的「左右滑動」提示：滑過就收起來
const year = new Date().getFullYear()
const swiped = ref(false)
// 窄螢幕上哪幾則嵌入已經點過（拿掉蓋在上面的那一層，可以直接操作平台的框）
const touched = reactive<Record<number, boolean>>({})
const initial = computed(() => (props.view.name.trim()[0] ?? '?').toUpperCase())
</script>

<template>
  <div ref="root" class="pg" :class="{ 'pg-animate': animate }" :style="colors">
    <div v-if="view.coverUrl" class="pg-cover" :style="{ backgroundImage: `url('${view.coverUrl}')` }" aria-hidden="true" />
    <div class="pg-inner">
      <template v-for="(block, i) in view.blocks" :key="block">
        <header v-if="block === 'profile'" class="pg-hero pg-in" :style="{ '--i': i }">
          <div class="pg-hero-top">
            <img v-if="view.avatarUrl" class="pg-avatar" :src="view.avatarUrl" alt="">
            <div v-else class="pg-avatar" aria-hidden="true">{{ initial }}</div>
            <div class="pg-hero-name">
              <span class="pg-kicker">{{ view.tagline || 'CREATOR' }}</span>
              <h1>{{ view.name }}</h1>
            </div>
            <a v-if="view.contact" class="pg-cta pg-cta-top" :href="`mailto:${view.contact.email}`"><span>{{ view.contact.label }}</span><span aria-hidden="true">→</span></a>
          </div>
          <p v-if="view.bio" class="pg-bio">{{ view.bio }}</p>
        </header>

        <section v-else-if="block === 'accounts' && view.accounts.length" class="pg-card pg-rows pg-in" :style="{ '--i': i }" aria-label="各平台數字">
          <a v-for="(a, ai) in view.accounts" :key="ai" class="pg-acct" :href="a.url" target="_blank" rel="noopener noreferrer">
            <span class="pg-acct-name">
              <span class="pg-label"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path :d="PLATFORM_ICONS[a.platform].path" :fill="iconColor(a.platform)" /></svg>{{ PLATFORMS[a.platform].label }}</span>
              <span class="pg-small">{{ a.name }}</span>
            </span>
            <span class="pg-cell pg-acct-main"><span class="pg-big">{{ a.followers != null ? num(a.followers) : '—' }}</span><span class="pg-small">{{ unitOf(a.platform) }}</span></span>
            <span class="pg-cell"><span class="pg-mid">{{ a.avgViews != null ? num(a.avgViews) : '—' }}</span><span class="pg-small">平均每則觀看</span></span>
            <span class="pg-cell"><span class="pg-mid">{{ a.rate }}</span><span class="pg-small">互動率</span></span>
            <span class="pg-cell"><span class="pg-mid">{{ signed(a.growth) }}</span><span class="pg-small">{{ growthLabel(a.platform) }}</span></span>
          </a>
        </section>

        <section v-else-if="block === 'stats' && view.stats && view.stats.items.length" class="pg-stats pg-in" :style="{ '--i': i }" :aria-label="`近 ${view.stats.days} 天成效`">
          <span class="pg-stats-label">LAST {{ view.stats.days }} DAYS</span>
          <div class="pg-grid pg-grid-xs">
            <div v-for="item in view.stats.items" :key="item.key"><span class="pg-huge">{{ statText(item) }}</span><span class="pg-stats-small">{{ item.label }}</span></div>
          </div>
        </section>

        <section v-else-if="block === 'collab' && view.collab && (view.collab.items.length || view.collab.brands.length || view.contact)" class="pg-section pg-in" :style="{ '--i': i }" aria-label="合作">
          <h2>合作</h2>
          <div class="pg-card pg-collab">
            <div v-if="view.collab.items.length || view.collab.brands.length" class="pg-grid">
              <div v-if="view.collab.items.length" class="pg-collab-group">
                <span class="pg-label">合作項目</span>
                <div class="pg-chips"><span v-for="item in view.collab.items" :key="item" class="pg-chip">{{ item }}</span></div>
              </div>
              <div v-if="view.collab.brands.length" class="pg-collab-group">
                <span class="pg-label">合作過的品牌</span>
                <div class="pg-brands"><span v-for="brand in view.collab.brands" :key="brand">{{ brand }}</span></div>
              </div>
            </div>
            <a v-if="view.contact" class="pg-cta" :href="`mailto:${view.contact.email}`"><span>{{ view.contact.label }} · {{ view.contact.email }}</span><span aria-hidden="true">→</span></a>
          </div>
        </section>

        <section v-else-if="block === 'posts' && view.posts.length" class="pg-section pg-in" :style="{ '--i': i }" aria-label="精選貼文">
          <div class="pg-section-head">
            <h2>精選貼文</h2>
            <!-- 窄螢幕上貼文是左右滑的一排：滑過一次之前用會動的箭頭提示 -->
            <span v-if="view.posts.length > 1 && !swiped" class="pg-swipe" aria-hidden="true">左右滑動<span class="pg-swipe-arrow">→</span></span>
          </div>
          <div class="pg-grid pg-grid-posts" @scroll.passive="swiped = true">
            <template v-for="(p, pi) in view.posts" :key="pi">
              <!-- 嵌入：平台自己的框（圖片、影片都在裡面），下面補上平台不會顯示的觀看與互動率 -->
              <div v-if="p.embed" class="pg-card pg-post pg-embed">
                <div class="pg-frame">
                  <iframe
                    :src="p.embed.src" :data-embed="p.embed.src" :style="frameStyle(p.embed)" :title="`${PLATFORMS[p.platform].label} 貼文`"
                    loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture; fullscreen"
                    sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
                  />
                  <!-- 手指落在 iframe 上時，滑動會被裡面的頁面吃掉、整排滑不動：窄螢幕上先蓋一層透明的，滑動照常；點一下才把這則交給平台的框操作 -->
                  <button v-if="!touched[pi]" type="button" class="pg-frame-cover" :aria-label="`操作這則 ${PLATFORMS[p.platform].label} 貼文`" @click="touched[pi] = true" />
                </div>
                <span class="pg-post-foot"><span class="pg-post-num">{{ num(p.views) }}</span><span class="pg-small">觀看 · 互動率 {{ p.rate }}</span></span>
              </div>
              <component :is="p.url ? 'a' : 'div'" v-else class="pg-card pg-post" :href="p.url || undefined" target="_blank" rel="noopener noreferrer">
                <span class="pg-label"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path :d="PLATFORM_ICONS[p.platform].path" :fill="iconColor(p.platform)" /></svg>{{ PLATFORMS[p.platform].label }} · {{ p.day }}</span>
                <span class="pg-post-text">{{ p.text || '（沒有文字的貼文）' }}</span>
                <span class="pg-post-foot"><span class="pg-post-num">{{ num(p.views) }}</span><span class="pg-small">觀看 · 互動率 {{ p.rate }}</span></span>
              </component>
            </template>
          </div>
        </section>

        <section v-else-if="block === 'series' && view.series.length" class="pg-section pg-in" :style="{ '--i': i }" aria-label="系列文">
          <h2>系列文</h2>
          <article v-for="s in view.series" :key="s.name" class="pg-card pg-series" :class="view.seriesLayout === 'v' && s.top.length ? 'v' : 'h'">
            <div class="pg-series-head">
              <div v-if="s.coverUrl" class="pg-series-cover" role="img" :aria-label="`${s.name} 的封面`" :style="{ backgroundImage: `url('${s.coverUrl}')` }" />
              <div class="pg-series-info">
                <div class="pg-series-title">
                  <span class="pg-series-name">{{ s.name }}</span>
                  <span v-if="s.text" class="pg-small pg-series-text">{{ s.text }}</span>
                </div>
                <div class="pg-series-nums">
                  <span><b>{{ num(s.posts) }}</b><span class="pg-small">則貼文</span></span>
                  <span><b>{{ num(s.views) }}</b><span class="pg-small">累計觀看</span></span>
                </div>
              </div>
            </div>
            <div v-if="s.top.length" class="pg-series-top">
              <component :is="t.url ? 'a' : 'div'" v-for="(t, ti) in s.top" :key="ti" class="pg-top" :href="t.url || undefined" target="_blank" rel="noopener noreferrer">
                <span class="pg-top-rank" aria-hidden="true">{{ ti + 1 }}</span>
                <span class="pg-top-body">
                  <span class="pg-label"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path :d="PLATFORM_ICONS[t.platform].path" :fill="iconColor(t.platform)" /></svg>{{ PLATFORMS[t.platform].label }} · {{ t.day }}</span>
                  <span class="pg-top-text">{{ t.text || '（沒有文字的貼文）' }}</span>
                </span>
                <span class="pg-top-num"><b>{{ num(t.views) }}</b><span class="pg-small">觀看</span></span>
              </component>
            </div>
          </article>
        </section>

        <section v-else-if="block === 'text' && (view.textTitle || view.textBody)" class="pg-card pg-text pg-in" :style="{ '--i': i }">
          <h2 v-if="view.textTitle">{{ view.textTitle }}</h2>
          <p v-if="view.textBody">{{ view.textBody }}</p>
        </section>

        <section v-else-if="block === 'links' && view.links.length" class="pg-grid pg-in" :style="{ '--i': i }" aria-label="連結">
          <a v-for="(l, li) in view.links" :key="l.url + l.label" class="pg-cta" :class="{ ghost: li > 0 }" :href="l.url" target="_blank" rel="noopener noreferrer"><span>{{ l.label }}</span><span aria-hidden="true">→</span></a>
        </section>
      </template>
      <p class="pg-footer">Powered by OpenContentCreator · © {{ year }} CodeWorldBagel</p>
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

.pg-acct { display: grid; grid-template-columns: minmax(0, 1.5fr) repeat(4, minmax(0, 1fr)); gap: 8px 16px; align-items: center; padding: 16px 0; }
.pg-acct + .pg-acct { border-top: 1px solid var(--pg-line); }
.pg-acct-name { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.pg-cell { display: flex; flex-direction: column; align-items: flex-end; min-width: 0; text-align: right; }
.pg-mid { font-size: 20px; font-weight: 800; line-height: 1.3; font-variant-numeric: tabular-nums; }
.pg-cta-top { flex: none; min-height: 56px; padding: 0 24px; font-size: 17px; }
.pg-collab { padding: 22px 24px; display: flex; flex-direction: column; gap: 22px; }
.pg-collab-group { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.pg-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.pg-chip { padding: 6px 16px; border-radius: 999px; border: 1px solid var(--pg-line); font-size: 16px; font-weight: 700; overflow-wrap: anywhere; }
.pg-brands { display: flex; flex-wrap: wrap; gap: 6px 22px; font-size: 18px; font-weight: 700; overflow-wrap: anywhere; }
.pg-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.pg-swipe { display: none; flex: none; align-items: center; gap: 6px; padding-right: 4px; font-size: 13px; font-weight: 900; letter-spacing: 0.1em; color: var(--pg-accent-text); }
.pg-swipe-arrow { display: inline-block; animation: pg-swipe 1.1s ease-in-out infinite; }
@keyframes pg-swipe { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(7px); } }
@keyframes pg-nudge { 0%, 100% { transform: none; } 40% { transform: translateX(-36px); } }
.pg-grid-posts { align-items: start; grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); }
.pg-post.pg-embed { padding: 0; gap: 0; min-height: 0; overflow: hidden; }
.pg-frame { position: relative; }
.pg-frame-cover { display: none; position: absolute; inset: 0; width: 100%; padding: 0; border: 0; background: transparent; cursor: pointer; }
.pg-embed iframe { display: block; width: 100%; border: 0; background: #ffffff; }
.pg-embed .pg-post-foot { margin: 0; padding: 14px 20px; }
.pg-series { overflow: hidden; display: flex; flex-direction: column; }
.pg-series-head { display: flex; flex-direction: column; min-width: 0; }
.pg-series-cover { height: 200px; background-size: cover; background-position: center; }
.pg-series-info { padding: 20px 24px; display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: flex-end; justify-content: space-between; }
.pg-series-title { flex: 1 1 260px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.pg-series-name { font-size: 24px; font-weight: 900; line-height: 1.25; overflow-wrap: anywhere; }
.pg-series-text { font-size: 16px; }
.pg-series-nums { display: flex; gap: 24px; }
.pg-series-nums > span { display: flex; flex-direction: column; }
.pg-series-nums b, .pg-top-num b { font-size: 22px; font-weight: 900; line-height: 1.2; color: var(--pg-accent-text); font-variant-numeric: tabular-nums; }
.pg-top { min-width: 0; }
.pg-top-body { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.pg-top-text { font-size: 17px; font-weight: 700; line-height: 1.45; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.pg-top-num { display: flex; flex-direction: column; }
.pg-top-num b { color: var(--pg-ink); font-size: 20px; }
/* 水平：封面在上，熱門貼文一排卡片 */
.pg-series.h .pg-series-top { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; padding: 0 24px 22px; }
.pg-series.h .pg-top { box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; min-height: 150px; padding: 16px 18px; border-radius: 18px; border: 1px solid var(--pg-line); background: var(--pg-bg); }
.pg-series.h .pg-top-rank { display: none; }
.pg-series.h .pg-top-num { margin-top: auto; flex-direction: row; gap: 8px; align-items: baseline; }
/* 垂直：封面與介紹在左，熱門貼文在右邊一則一列 */
.pg-series.v { display: grid; grid-template-columns: minmax(0, 340px) minmax(0, 1fr); }
.pg-series.v .pg-series-info { flex-direction: column; align-items: flex-start; justify-content: flex-start; }
.pg-series.v .pg-series-title { flex: none; }
.pg-series.v .pg-series-top { display: flex; flex-direction: column; justify-content: center; padding: 6px 24px; border-left: 1px solid var(--pg-line); }
.pg-series.v .pg-top { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; gap: 14px; align-items: center; padding: 16px 0; }
.pg-series.v .pg-top + .pg-top { border-top: 1px solid var(--pg-line); }
.pg-series.v .pg-top-rank { font-size: 30px; font-weight: 900; line-height: 1; color: var(--pg-accent-text); }
.pg-series.v .pg-top-num { align-items: flex-end; }
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
.pg-post, .pg-cta, .pg-series.h .pg-top { transition: transform 0.18s ease, border-color 0.18s ease; }
a.pg-post:hover, .pg-cta:hover, .pg-series.h a.pg-top:hover { transform: translateY(-3px); border-color: var(--pg-accent); }
a.pg-acct:hover .pg-label, .pg-series.v a.pg-top:hover .pg-top-text { text-decoration: underline; }
.pg a:focus-visible { outline: 3px solid var(--pg-accent); outline-offset: 3px; }

/* 進場：各區塊依序淡入上移（只在對外的頁面） */
.pg-animate .pg-in { animation: pg-rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) both; animation-delay: calc(var(--i, 0) * 80ms); }
@keyframes pg-rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .pg-animate .pg-in, .pg-swipe-arrow, .pg-grid-posts > * { animation: none !important; }
  .pg-post, .pg-cta, .pg-series.h .pg-top { transition: none; }
  a.pg-post:hover, .pg-cta:hover, .pg-series.h a.pg-top:hover { transform: none; }
}
/* 窄螢幕：大字縮一級，免得名字一行只塞得下三四個字 */
@container (max-width: 520px) {
  .pg-hero { padding: 28px 20px 24px; border-radius: 26px; }
  .pg-hero h1 { font-size: 32px; }
  .pg-avatar { width: 88px; height: 88px; border-radius: 26px; font-size: 40px; }
  .pg-huge { font-size: 40px; }
  .pg-bio { font-size: 16px; }
  .pg-cta-top { flex: 1 1 100%; }
}
/* 窄的時候各平台那一列改成兩排：名稱＋粉絲數一排，其餘三個數字一排；垂直的系列文改成上下疊 */
@container (max-width: 640px) {
  .pg-acct { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .pg-acct-name { grid-column: span 2; }
  .pg-acct .pg-cell:not(.pg-acct-main) { align-items: flex-start; text-align: left; }
  .pg-series.v { grid-template-columns: minmax(0, 1fr); }
  .pg-series.v .pg-series-top { border-left: 0; border-top: 1px solid var(--pg-line); }
  /* 精選貼文不往下排成很長一頁：改成左右滑的一排，下一張露出一點邊；進場時整排往左晃兩下提示可以滑 */
  .pg-swipe { display: inline-flex; }
  .pg-frame-cover { display: block; }
  .pg-grid-posts { display: flex; gap: 12px; margin: 0 -16px; padding: 4px 16px; overflow-x: auto; overscroll-behavior-x: contain; scroll-snap-type: x mandatory; scroll-padding: 0 16px; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
  .pg-grid-posts::-webkit-scrollbar { display: none; }
  .pg-grid-posts > * { flex: 0 0 84%; scroll-snap-align: start; }
  .pg-grid-posts > :only-child { flex-basis: 100%; }
  .pg-grid-posts > :not(:only-child) { animation: pg-nudge 1.5s ease-in-out 1s 2; }
}
</style>
