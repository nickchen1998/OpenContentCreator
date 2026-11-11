// 時間一律以台北時間計，存成 'YYYY-MM-DDTHH:MM'（沒有時區），日期是 'YYYY-MM-DD'。
// 做加減時把字串當成 UTC 來算，避開執行環境的時區。
export const AT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

export const atMinutes = (at: string) => Date.parse(`${at}:00Z`) / 60000
export const minutesToAt = (minutes: number) => new Date(minutes * 60000).toISOString().slice(0, 16)
export const nowTaipei = () => minutesToAt(Math.floor(Date.now() / 60000) + 480)
export const todayTaipei = () => nowTaipei().slice(0, 10)
export const isValidAt = (at: unknown): at is string =>
  typeof at === 'string' && AT_RE.test(at) && !Number.isNaN(atMinutes(at)) && minutesToAt(atMinutes(at)) === at

export const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
/** 週一 = 0 */
export const weekdayIdx = (day: string) => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7
export const mondayOf = (day: string) => addDays(day, -weekdayIdx(day))
export const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']
export const fmtDay = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`
export const fmtDayFull = (day: string) => `${fmtDay(day)}（${WEEKDAYS[weekdayIdx(day)]}）`
export const fmtAt = (at: string) => `${fmtDayFull(at.slice(0, 10))}${at.slice(11)}`
