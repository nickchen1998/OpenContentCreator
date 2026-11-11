import { eq } from 'drizzle-orm'
import { connections } from '../../../database/schema'

// 連結一個帳號：會員貼上自己 Meta App 產生的 token 與 app secret。先用 token 查出是哪個帳號，確認可用才存。
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const accountId = idParam(event)
  const body = await bodyOf(event)
  const boot = await loadBoot(uid)
  const account = boot.accounts.find(a => a.id === accountId)
  if (!account) throw notFound('帳號')
  if (!isMetaPlatform(account.platform)) throw bad('這個平台還不能連結')
  // 已經連結的帳號可以只換 app secret（token 只顯示一次，不該為了改密鑰重新產生）
  if (!str(body.token, 'Access token', 1000, false)) {
    const existing = await ownedConnection(uid, accountId)
    if (!existing) throw bad('請填寫 Access token')
    const secret = str(body.appSecret, 'App secret', 100)
    if (!/^[0-9a-f]{32}$/i.test(secret)) throw bad('密鑰是 32 個字元的英數字，請按「顯示」後再複製')
    await useDb().update(connections).set({ appSecretEnc: await seal(secret), lastError: '' }).where(eq(connections.accountId, accountId))
    return { externalId: existing.connection.externalId, externalName: existing.connection.externalName, subscribeError: '' }
  }
  let token = str(body.token, 'Access token', 1000).replace(/\s+/g, '')
  // 已連結的帳號換 token 時密鑰可以留空（沿用原本的）。Threads 不走 webhook，不需要密鑰
  const previous = await ownedConnection(uid, accountId)
  const givenSecret = str(body.appSecret, '密鑰', 100, false)
  const appSecret = !hasWebhook(account.platform) ? '' : givenSecret || (previous ? await unseal(previous.connection.appSecretEnc) : '')
  if (hasWebhook(account.platform) && !appSecret) throw bad('請填寫密鑰')
  if (hasWebhook(account.platform) && !/^[0-9a-f]{32}$/i.test(appSecret)) throw bad('密鑰是 32 個字元的英數字，請按「顯示」後再複製')

  // token 同時授權了好幾個帳號時用來挑是哪一個：已經連結過就沿用上次連到的那個，否則用登記的名稱
  const hint = previous?.connection.externalName || account.name
  let identity
  try {
    if (account.platform === 'facebook' && await isUserToken(token)) {
      // 貼進來的是用戶權杖：換成粉專自己的長效 Page token 再存
      const appId = str(body.appId, '應用程式編號', 30)
      if (!/^\d{5,25}$/.test(appId)) throw new MetaError('應用程式編號是一串數字')
      const missing = await missingPagePermissions(token)
      if (missing.length) throw new MetaError(`產生權杖時少勾了這些權限：${missing.join('、')}`)
      const page = await pageTokenFromUserToken(token, appId, appSecret, hint)
      token = page.token
      identity = { externalId: page.externalId, externalName: page.externalName }
    }
    else {
      identity = await identify(account.platform, token, hint)
    }
  }
  catch (e) {
    throw bad(`Token 無法使用：${(e as Error).message}`)
  }
  // 讓這個帳號的事件開始送到 webhook。Meta App 的 webhook 還沒設好時會失敗，不擋連結，把原因帶回去
  const subscribeError = hasWebhook(account.platform)
    ? await subscribe(account.platform, token, identity.externalId).then(() => '', e => (e as Error).message)
    : ''

  const values = {
    accountId, ...identity,
    tokenEnc: await seal(token), appSecretEnc: await seal(appSecret),
    // 「Instagram 登入」與 Threads 的長效 token 60 天到期（排程會自動換新）；粉專與統一登入的 token 不在這裡管
    tokenExpiresAt: account.platform === 'threads' || (account.platform === 'instagram' && isInstagramLoginToken(token)) ? new Date(Date.now() + 60 * 86400_000).toISOString() : null,
    lastError: subscribeError, createdAt: nowIso(),
  }
  await useDb().insert(connections).values(values).onConflictDoUpdate({ target: connections.accountId, set: values })
  return { ...identity, subscribeError }
})
