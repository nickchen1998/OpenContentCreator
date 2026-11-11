// 平台 token 與 app secret 存進 D1 之前先用 AES-GCM 加密，金鑰來自 secret NUXT_TOKEN_KEY。
// 資料庫外流時拿不到可用的 token；金鑰只在 Worker 的 secret 裡。
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const unb64 = (text: string) => Uint8Array.from(atob(text), c => c.charCodeAt(0))
const encoder = new TextEncoder()

let cachedKey: Promise<CryptoKey> | undefined
function tokenKey() {
  const secret = useRuntimeConfig().tokenKey
  if (!secret || secret.length < 32) throw createError({ statusCode: 500, message: '伺服器還沒設定 NUXT_TOKEN_KEY' })
  return (cachedKey ??= crypto.subtle.digest('SHA-256', encoder.encode(secret))
    .then(raw => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])))
}

export async function seal(plain: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await tokenKey(), encoder.encode(plain)))
  return `v1.${b64(iv)}.${b64(data)}`
}

export async function unseal(sealed: string) {
  const [version, iv, data] = sealed.split('.')
  if (version !== 'v1' || !iv || !data) throw new Error('無法解開儲存的 token')
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await tokenKey(), unb64(data))
  return new TextDecoder().decode(plain)
}

/** Meta webhook 的簽章：X-Hub-Signature-256: sha256=<HMAC-SHA256(app secret, 原始 body)> */
export async function verifyHubSignature(rawBody: string, header: string | undefined, appSecret: string) {
  const given = header?.match(/^sha256=([0-9a-f]{64})$/i)?.[1]?.toLowerCase()
  if (!given) return false
  const key = await crypto.subtle.importKey('raw', encoder.encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody)))
  const expected = [...mac].map(b => b.toString(16).padStart(2, '0')).join('')
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i)
  return diff === 0
}

export const randomKey = (bytes = 24) => [...crypto.getRandomValues(new Uint8Array(bytes))].map(b => b.toString(16).padStart(2, '0')).join('')
