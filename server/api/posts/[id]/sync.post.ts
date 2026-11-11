import { and, eq, ne } from 'drizzle-orm'
import { accounts, connections, postTargets } from '../../../database/schema'

// 立刻同步這則貼文各平台的成效（已貼上連結、帳號已連結的才會同步）
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const id = idParam(event)
  await ownedPost(uid, id)
  const rows = await useDb().select({ target: { id: postTargets.id, publishedUrl: postTargets.publishedUrl, externalPostId: postTargets.externalPostId }, connection: connections, platform: accounts.platform })
    .from(postTargets)
    .innerJoin(connections, eq(connections.accountId, postTargets.accountId))
    .innerJoin(accounts, eq(accounts.id, postTargets.accountId))
    .where(and(eq(postTargets.postId, id), ne(postTargets.publishedUrl, '')))
  if (!rows.length) throw bad('沒有可以同步的平台：要先貼上貼文連結，而且帳號要已經連結')
  const errors: string[] = []
  for (const r of rows.slice(0, 8)) {
    if (!isMetaPlatform(r.platform)) continue
    const [result] = await syncTargets(r.platform, r.connection, [r.target])
    if (result?.error) errors.push(`${PLATFORMS[r.platform].label}：${result.error}`)
  }
  return { post: await loadPost(await loadBoot(uid), id), errors }
})
