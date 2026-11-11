// 這個帳號在平台上最近的貼文：建立「指定貼文」的規則時用來挑選
export default defineEventHandler(async (event) => {
  const found = await ownedConnection(uidOf(event), idParam(event))
  if (!found || !isMetaPlatform(found.platform)) throw bad('這個帳號還沒有連結')
  try {
    return await listRecentPosts(found.platform, await unseal(found.connection.tokenEnc), found.connection.externalId, 30)
  }
  catch (e) {
    throw bad(`讀不到貼文：${(e as Error).message}`, 502)
  }
})
