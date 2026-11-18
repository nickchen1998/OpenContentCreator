<script setup lang="ts">
// Chart.js 的長條圖：單一數列或堆疊，橫向或直向。只註冊用得到的部分，打包才不會把整個 Chart.js 帶進來
import { BarController, BarElement, CategoryScale, Chart, Legend, LinearScale, Tooltip } from 'chart.js'
import type { Plugin } from 'chart.js'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

const props = defineProps<{
  labels: string[]
  datasets: { label: string, data: number[], color: string }[]
  horizontal?: boolean
  stacked?: boolean
  /** 在長條末端標出數值（單一數列時用；堆疊時靠圖例與提示） */
  valueLabels?: boolean
  /** 給螢幕閱讀器的摘要 */
  summary: string
  height?: number
  /** 填滿外層容器的高度（外層要有明確高度或是 flex 子項） */
  fill?: boolean
  /** 每個類別前面畫的平台商標（跟 labels 對齊；只支援橫向）。標籤文字就不用再寫平台名稱 */
  icons?: (Platform | undefined)[]
}>()

const canvas = ref<HTMLCanvasElement>()
let chart: Chart | undefined
const INK = '#2e362f'
const MUTED = '#68736a'
const GRID = '#eceee6'
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "Microsoft JhengHei", sans-serif'
const ICON = 14
const ICON_GAP = 5

// 類別軸的標籤前面畫平台商標：圖表左邊留一個圖示的寬度，畫完標籤後再把圖示畫在文字左邊
const iconPaths = new Map<Platform, Path2D>()
const iconPath = (p: Platform) => {
  let path = iconPaths.get(p)
  if (!path) iconPaths.set(p, path = new Path2D(PLATFORM_ICONS[p].path))
  return path
}
const platformIconsPlugin = (axis: 'x' | 'y'): Plugin<'bar'> => ({
  id: 'platformIcons',
  afterDraw(c) {
    const scale = c.scales[axis]
    if (!scale || !props.icons) return
    const { ctx } = c
    ctx.save()
    scale.getLabelItems().forEach((item, i) => {
      const platform = props.icons![scale.ticks[i]?.value ?? i]
      if (!platform) return
      ctx.font = item.font.string
      const width = ctx.measureText(String(item.label)).width
      const [x, y] = item.options.translation ?? [0, 0]
      const left = (item.options.textAlign === 'left' ? x : x - width) - ICON_GAP - ICON
      ctx.save()
      ctx.translate(left, y - ICON / 2)
      ctx.scale(ICON / 24, ICON / 24)
      ctx.fillStyle = PLATFORM_ICONS[platform].color
      ctx.fill(iconPath(platform))
      ctx.restore()
    })
    ctx.restore()
  },
})

function build() {
  if (!canvas.value) return
  chart?.destroy()
  const valueAxis = props.horizontal ? 'x' : 'y'
  const categoryAxis = props.horizontal ? 'y' : 'x'
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const withIcons = props.horizontal && !!props.icons?.some(Boolean)
  chart = new Chart(canvas.value, {
    type: 'bar',
    data: {
      labels: props.labels,
      datasets: props.datasets.map(d => ({
        label: d.label,
        data: d.data,
        backgroundColor: d.color,
        maxBarThickness: 24,
        // 堆疊時每一段之間留 2px 的白，靠間隙分開而不是描邊
        borderColor: '#ffffff',
        borderWidth: props.stacked ? (props.horizontal ? { right: 2 } : { top: 2 }) : 0,
        borderRadius: props.stacked ? 0 : (props.horizontal ? { topRight: 4, bottomRight: 4 } : { topLeft: 4, topRight: 4 }),
        borderSkipped: false,
      })),
    },
    options: {
      indexAxis: props.horizontal ? 'y' : 'x',
      responsive: true,
      maintainAspectRatio: false,
      animation: reduced ? false : { duration: 300 },
      layout: { padding: { left: withIcons ? ICON + ICON_GAP : 0, right: props.valueLabels && props.horizontal ? 56 : 4, top: props.valueLabels && !props.horizontal ? 18 : 0 } },
      scales: {
        [valueAxis]: {
          stacked: props.stacked, beginAtZero: true,
          grid: { color: GRID, drawTicks: false }, border: { display: false },
          ticks: { color: MUTED, font: { family: FONT, size: 13 }, padding: 6, precision: 0, maxTicksLimit: 5 },
        },
        [categoryAxis]: {
          stacked: props.stacked,
          grid: { display: false }, border: { color: GRID },
          // 橫向時標籤靠左對齊（從軸的左緣開始寫），商標畫在左邊留白的位置
          ticks: { color: INK, font: { family: FONT, size: 13 }, autoSkip: !props.horizontal, maxRotation: 0, crossAlign: props.horizontal ? 'far' : 'near' },
        },
      },
      plugins: {
        legend: {
          display: props.datasets.length > 1, position: 'bottom', align: 'start',
          labels: { color: INK, font: { family: FONT, size: 13 }, boxWidth: 10, boxHeight: 10, padding: 14 },
        },
        tooltip: {
          backgroundColor: INK, titleFont: { family: FONT, size: 13 }, bodyFont: { family: FONT, size: 13 }, padding: 10, cornerRadius: 8, displayColors: props.datasets.length > 1,
          callbacks: {
            // 圖示在提示框裡畫不出來，標題改寫平台名稱
            title: items => items.map((item) => {
              const platform = withIcons ? props.icons![item.dataIndex] : undefined
              return platform ? `${PLATFORMS[platform].label} ${item.label}` : item.label
            }),
            label: ctx => ` ${ctx.dataset.label}：${Number(ctx.parsed[valueAxis as 'x' | 'y']).toLocaleString('en-US')}`,
          },
        },
      },
    },
    plugins: [
      ...(withIcons ? [platformIconsPlugin(categoryAxis)] : []),
      ...(props.valueLabels
      ? [{
          id: 'valueLabels',
          afterDatasetsDraw(c) {
            const { ctx } = c
            ctx.save()
            ctx.fillStyle = INK
            ctx.font = `600 13px ${FONT}`
            c.getDatasetMeta(0).data.forEach((bar, i) => {
              const value = Number(props.datasets[0]!.data[i] ?? 0)
              // 直向的每日長條：0 不標，免得一排 0
              if (!props.horizontal && !value) return
              const text = value.toLocaleString('en-US')
              if (props.horizontal) {
                ctx.textAlign = 'left'
                ctx.textBaseline = 'middle'
                ctx.fillText(text, bar.x + 8, bar.y)
              }
              else {
                ctx.textAlign = 'center'
                ctx.textBaseline = 'bottom'
                ctx.fillText(text, bar.x, bar.y - 4)
              }
            })
            ctx.restore()
          },
        } satisfies Plugin<'bar'>]
      : []),
    ],
  })
}

onMounted(build)
watch(() => [props.labels, props.datasets, props.icons], build, { deep: true })
onBeforeUnmount(() => chart?.destroy())
</script>

<template>
  <div :style="fill ? { position: 'relative', flex: '1 1 0', minHeight: '0' } : { position: 'relative', height: `${height ?? 180}px` }">
    <canvas ref="canvas" role="img" :aria-label="summary" />
  </div>
</template>
