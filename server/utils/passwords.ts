// PBKDF2-SHA256。次數 20,000：Workers Free 方案每個請求只有 10ms CPU，再高登入會超時。
// 格式 pbkdf2$<次數>$<salt hex>$<hash hex>，scripts/set-user.mjs 產生的是同一種。
const ITERATIONS = 20_000
const toHex = (bytes: Uint8Array) => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
const fromHex = (hex: string) => new Uint8Array((hex.match(/.{2}/g) ?? []).map(h => Number.parseInt(h, 16)))

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256))
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return `pbkdf2$${ITERATIONS}$${toHex(salt)}$${toHex(await derive(password, salt, ITERATIONS))}`
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, iterations, salt, hash] = stored.split('$')
  const n = Number(iterations)
  if (scheme !== 'pbkdf2' || !Number.isInteger(n) || n < 1 || n > 100_000 || !salt || !hash) return false
  const actual = toHex(await derive(password, fromHex(salt), n))
  let diff = actual.length ^ hash.length
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ hash.charCodeAt(i % hash.length)
  return diff === 0
}

/**
 * 密碼的「版本」：登入時放進 session（只有伺服器看得到的 secure 區塊），每個請求比對一次。
 * 密碼一改，雜湊就變、版本跟著變，所有舊的登入立刻失效（被偷走的 session 也是）。
 */
export const passwordVersion = async (passwordHash: string) => (await sha256(`session:${passwordHash}`)).slice(0, 24)

// 帳號不存在時也照樣做一次同樣成本的運算，回應時間才不會洩漏帳號存不存在。內容不是秘密，也對不上任何密碼
const DUMMY_HASH = `pbkdf2$${ITERATIONS}$${'00'.repeat(16)}$${'00'.repeat(32)}`
export const verifyDummyPassword = (password: string) => verifyPassword(password, DUMMY_HASH)

/** 給管理員建立帳號、重設密碼時用的隨機密碼（去掉容易看錯的字） */
export function randomPassword(length = 14) {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(length * 2))
  let out = ''
  for (const b of bytes) {
    if (b < 220 && out.length < length) out += alphabet[b % alphabet.length] // 220 = 55 × 4，避免取餘數的偏差
  }
  return out.padEnd(length, 'x')
}

export const USERNAME_RE = /^[a-z0-9][a-z0-9_.-]{2,31}$/
export function usernameOf(value: unknown) {
  const username = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!USERNAME_RE.test(username)) throw bad('帳號要是 3–32 個英數字（可含 _ . -），以英數字開頭')
  return username
}
export function passwordOf(value: unknown) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 200) throw bad('密碼至少 8 個字')
  return value
}
