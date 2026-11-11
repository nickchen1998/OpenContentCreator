import { connections } from '../../database/schema'

// Google 同意畫面回來的地方：驗 state、把 code 換成 refresh token、查出是哪個頻道，存成這個帳號的連結，再回到帳號頁。
// 這裡在 /api 底下，所以一樣要登入；state 裡的會員要跟目前登入的是同一個人
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const q = getQuery(event)
  // 回到帳號頁時網址上只帶固定的代碼，文字由頁面對照；不把 Google 或任何人給的字串直接帶回去顯示
  const back = (code: 'ok' | 'denied' | 'google' | 'invalid' | 'expired' | 'account' | 'notconfigured' | 'nochannel' | 'norefresh' | 'failed') =>
    sendRedirect(event, `/accounts?youtube=${code}`)
  if (q.error) return back(q.error === 'access_denied' ? 'denied' : 'google')
  let state: { uid: number, accountId: number, at: number }
  try {
    state = JSON.parse(await unseal(String(q.state ?? '')))
  }
  catch {
    return back('invalid')
  }
  if (state.uid !== uid || Date.now() - state.at > 15 * 60_000) return back('expired')
  const boot = await loadBoot(uid)
  const account = boot.accounts.find(a => a.id === state.accountId)
  if (!account || account.platform !== 'youtube') return back('account')
  try {
    const tokens = await youtubeExchangeCode(String(q.code ?? ''), `${getRequestURL(event).origin}/api/youtube/callback`)
    if (!tokens.refresh_token) throw new YoutubeError('Google 沒有給長期授權', 'norefresh')
    const channel = await youtubeChannel(tokens.refresh_token, tokens.access_token)
    const values = {
      accountId: account.id, ...channel, tokenEnc: await seal(tokens.refresh_token), appSecretEnc: await seal(''),
      tokenExpiresAt: null, lastError: '', createdAt: nowIso(),
    }
    await useDb().insert(connections).values(values).onConflictDoUpdate({ target: connections.accountId, set: values })
    return back('ok')
  }
  catch (e) {
    // 真正的原因記在 log（wrangler tail 看得到），不帶回網址
    console.warn('youtube connect failed', (e as Error).message)
    return back((e instanceof YoutubeError && e.code) || 'failed')
  }
})
