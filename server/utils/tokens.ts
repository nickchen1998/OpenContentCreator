const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')

export const sha256 = async (text: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))

/** 專案的 MCP token：只在產生當下顯示一次，資料庫只存 sha256。 */
export async function newProjectToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const token = `occ_${btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
  return { token, tokenHash: await sha256(token), tokenPrefix: `${token.slice(0, 8)}…` }
}

/** 比對時間不隨內容變化的字串比較（先雜湊成等長再比） */
export async function safeEqual(a: string, b: string) {
  const [x, y] = await Promise.all([sha256(a), sha256(b)])
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i)
  return diff === 0
}
