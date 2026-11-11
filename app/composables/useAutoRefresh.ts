// 頁面開著時每 30 秒問伺服器一次資料有沒有變，有變才呼叫 onChange 重新載入；分頁在背景時暫停，切回來立刻檢查一次。
// 檢查失敗（斷線、登入過期）就安靜略過，不跳訊息。
const INTERVAL = 30_000

export function useAutoRefresh(onChange: () => unknown) {
  let stamp: string | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  let checking = false

  async function check() {
    if (checking || document.hidden) return
    checking = true
    try {
      const next = (await $fetch<{ stamp: string }>('/api/changes')).stamp
      const changed = stamp !== undefined && next !== stamp
      stamp = next
      if (changed) await onChange()
    }
    catch {
      // 下一輪再試
    }
    checking = false
  }
  const onVisible = () => { if (!document.hidden) check() }

  onMounted(() => {
    check()
    timer = setInterval(check, INTERVAL)
    document.addEventListener('visibilitychange', onVisible)
  })
  onBeforeUnmount(() => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisible)
  })
}
