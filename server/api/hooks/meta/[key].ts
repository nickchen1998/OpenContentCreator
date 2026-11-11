// Meta 的 webhook（Instagram 與 Facebook 粉專共用）。不需要登入，改用兩層驗證：
// 網址裡的 key 對應到會員；每個事件再用該帳號的 app secret 驗 X-Hub-Signature-256。
export default defineEventHandler(async (event) => {
  const owner = await hookOwner(getRouterParam(event, 'key') ?? '')
  if (!owner) throw createError({ statusCode: 404, message: 'Not Found' })

  // 在 Meta App 設定 webhook 時的驗證：原樣回傳 hub.challenge
  if (event.method === 'GET') {
    const q = getQuery(event)
    if (q['hub.mode'] !== 'subscribe' || !owner.verifyToken || q['hub.verify_token'] !== owner.verifyToken) throw createError({ statusCode: 403, message: 'Forbidden' })
    setResponseHeader(event, 'Content-Type', 'text/plain')
    return String(q['hub.challenge'] ?? '')
  }
  if (event.method !== 'POST') throw createError({ statusCode: 405, message: 'Method Not Allowed' })

  const raw = (await readRawBody(event, 'utf8')) ?? ''
  const signature = getHeader(event, 'x-hub-signature-256')
  let payload: any
  try {
    payload = JSON.parse(raw)
  }
  catch {
    throw createError({ statusCode: 400, message: 'Bad Request' })
  }
  const platform = payload?.object === 'instagram' ? 'instagram' : payload?.object === 'page' ? 'facebook' : null
  if (!platform || !Array.isArray(payload.entry)) return 'IGNORED'
  const source: 'instagram' | 'facebook' = platform

  // 先驗完簽章再處理：找不到連結或簽章不對的 entry 直接丟掉
  const verified = []
  for (const entry of payload.entry.slice(0, 20)) {
    const connection = await findConnection(owner.uid, platform, String(entry?.id ?? ''))
    if (connection && await verifyHubSignature(raw, signature, await unseal(connection.appSecretEnc))) verified.push({ entry, connection })
  }
  if (!verified.length) throw createError({ statusCode: 403, message: 'Forbidden' })

  // Meta 要求幾秒內回 200，否則會重送；實際處理（跑規則、呼叫 Graph API）放到回應之後
  const work = (async () => {
    const boot = await loadBoot(owner.uid)
    for (const { entry, connection } of verified) {
      for (const e of eventsOf(source, entry)) {
        await receive(boot, source, connection, e).catch(error => console.error('webhook event failed', platform, error))
      }
    }
  })()
  const ctx = event.context.cloudflare?.context
  if (ctx?.waitUntil) ctx.waitUntil(work)
  else await work
  return 'EVENT_RECEIVED'
})
