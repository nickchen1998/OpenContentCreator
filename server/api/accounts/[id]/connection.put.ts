import { connections } from '../../../database/schema'

// 連結一個帳號：會員貼上自己 Meta App 產生的 token 與 app secret。先用 token 查出是哪個帳號，確認可用才存。
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const accountId = idParam(event)
  const body = await bodyOf(event)
  const boot = await loadBoot(uid)
  const account = allAccounts(boot).find(a => a.id === accountId)
  if (!account) throw notFound('帳號')
  if (!isMetaPlatform(account.platform)) throw bad('這個平台還不能連結')
  const token = str(body.token, 'Access token', 1000).replace(/\s+/g, '')
  // Threads 不走 webhook，不需要 app secret
  const appSecret = hasWebhook(account.platform) ? str(body.appSecret, 'App secret', 100) : ''
  if (hasWebhook(account.platform) && !/^[0-9a-f]{32}$/i.test(appSecret)) throw bad('App secret 是 32 個字元的英數字，請到 Meta App 的「應用程式設定 › 基本資料」複製')

  let identity
  try {
    identity = await identify(account.platform, token)
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
    // Instagram 與 Threads 的長效 token 60 天到期（每天的排程會自動換新）；粉專的 Page token 不會到期
    tokenExpiresAt: account.platform !== 'facebook' ? new Date(Date.now() + 60 * 86400_000).toISOString() : null,
    lastError: subscribeError, createdAt: nowIso(),
  }
  await useDb().insert(connections).values(values).onConflictDoUpdate({ target: connections.accountId, set: values })
  return { ...identity, subscribeError }
})
