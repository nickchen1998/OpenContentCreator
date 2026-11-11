import type { H3Event } from 'h3'

export const bad = (message: string, statusCode = 400) => createError({ statusCode, message })
export const notFound = (what = '資料') => createError({ statusCode: 404, message: `找不到這筆${what}` })

export function idParam(event: H3Event, name = 'id') {
  const value = Number(getRouterParam(event, name))
  if (!Number.isInteger(value) || value <= 0) throw notFound()
  return value
}

export async function bodyOf(event: H3Event): Promise<Record<string, unknown>> {
  const body = await readBody(event).catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('請求內容格式不對')
  return body
}

export function str(value: unknown, label: string, max = 200, required = true) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (required && !text) throw bad(`請填寫${label}`)
  if (text.length > max) throw bad(`${label}最多 ${max} 個字`)
  return text
}

export function int(value: unknown, label: string, min = 0, max = 1_000_000_000) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${label}要是 ${min} 到 ${max} 之間的整數`)
  return n
}

export function idList(value: unknown, label: string) {
  if (!Array.isArray(value) || !value.length) throw bad(`請至少選一個${label}`)
  const ids = [...new Set(value.map(Number))]
  if (ids.some(n => !Number.isInteger(n) || n <= 0)) throw bad(`${label}格式不對`)
  return ids
}

export const nowIso = () => new Date().toISOString()
