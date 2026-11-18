import { and, eq } from 'drizzle-orm'
import { accountPosts, accounts } from '../../database/schema'

// 對話細節的「貼文內容」：用（帳號, 平台貼文 id）找到那則貼文，回傳平台的嵌入框網址（跟公開頁面同一套 embedOf）。
// 帳號一定要是登入會員的，否則 404。嵌不了的平台或網址 embed 是 null，畫面退回顯示文字與連結
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const query = getQuery(event)
  const accountId = Number(query.accountId)
  const externalId = String(query.externalPostId ?? '')
  if (!Number.isInteger(accountId) || !externalId) throw notFound('貼文')
  const [post] = await useDb().select({ platform: accounts.platform, url: accountPosts.url, text: accountPosts.text, externalId: accountPosts.externalId })
    .from(accountPosts).innerJoin(accounts, eq(accounts.id, accountPosts.accountId))
    .where(and(eq(accounts.ownerId, uid), eq(accountPosts.accountId, accountId), eq(accountPosts.externalId, externalId)))
  if (!post) throw notFound('貼文')
  return { url: post.url, text: post.text, embed: isPlatform(post.platform) ? embedOf(post.platform, post.url, post.externalId) : null }
})
