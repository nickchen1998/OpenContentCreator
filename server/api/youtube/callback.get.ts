import { connections } from '../../database/schema'

// Google 同意畫面回來的地方：驗 state、把 code 換成 refresh token、查出是哪個頻道，存成這個帳號的連結，再回到帳號頁。
// 這裡在 /api 底下，所以一樣要登入；state 裡的會員要跟目前登入的是同一個人
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const q = getQuery(event)
  const back = (message: string) => sendRedirect(event, `/accounts?youtube=${encodeURIComponent(message)}`)
  if (q.error) return back(q.error === 'access_denied' ? '你沒有同意授權' : `Google 回報：${q.error}`)
  let state: { uid: number, accountId: number, at: number }
  try {
    state = JSON.parse(await unseal(String(q.state ?? '')))
  }
  catch {
    return back('連結的請求無效，請再試一次')
  }
  if (state.uid !== uid || Date.now() - state.at > 15 * 60_000) return back('連結的請求過期了，請再試一次')
  const boot = await loadBoot(uid)
  const account = boot.accounts.find(a => a.id === state.accountId)
  if (!account || account.platform !== 'youtube') return back('找不到要連結的帳號')
  try {
    const tokens = await youtubeExchangeCode(String(q.code ?? ''), `${getRequestURL(event).origin}/api/youtube/callback`)
    if (!tokens.refresh_token) throw new YoutubeError('Google 沒有給長期授權，請到 Google 帳號的「第三方應用程式存取權」移除這個應用程式後再連結一次')
    const channel = await youtubeChannel(tokens.refresh_token, tokens.access_token)
    const values = {
      accountId: account.id, ...channel, tokenEnc: await seal(tokens.refresh_token), appSecretEnc: await seal(''),
      tokenExpiresAt: null, lastError: '', createdAt: nowIso(),
    }
    await useDb().insert(connections).values(values).onConflictDoUpdate({ target: connections.accountId, set: values })
    return back('ok')
  }
  catch (e) {
    return back((e as Error).message.slice(0, 200))
  }
})
