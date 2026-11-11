import { and, desc, eq } from 'drizzle-orm'
import { accountPosts, accounts, collectionPosts, connections } from '../../database/schema'

// 串文管理頁的「立即同步」：把這個會員各 Threads 帳號最新幾則貼文的整串對話抓回來（成效數字由 /api/insights/sync 同步）。
// Free 方案一個請求最多 50 個對外請求與 50 個 D1 查詢，所以帳號越多、每個帳號看的貼文與處理的留言就越少；沒輪到的由排程接手
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const db = useDb()
  const rows = (await db.select({ connection: connections }).from(connections)
    .innerJoin(accounts, eq(accounts.id, connections.accountId))
    .where(and(eq(accounts.ownerId, uid), eq(accounts.platform, 'threads')))).slice(0, 4)
  if (!rows.length) return { errors: [] }
  const perAccount = Math.max(2, Math.floor(8 / rows.length))
  const errors: string[] = []
  for (const { connection } of rows) {
    try {
      const posts = await db.select({ id: accountPosts.externalId, text: accountPosts.text, inSeries: collectionPosts.collectionId }).from(accountPosts)
        .leftJoin(collectionPosts, eq(collectionPosts.postId, accountPosts.id))
        .where(eq(accountPosts.accountId, connection.accountId)).orderBy(desc(accountPosts.publishedAt)).limit(perAccount)
      const warning = posts.length ? await importThreadConversations(connection, uid, posts, perAccount) : ''
      if (warning) errors.push(`${connection.externalName}：${warning}`)
    }
    catch (e) {
      errors.push(`${connection.externalName}：讀取 Threads 回覆失敗：${(e as Error).message}`.slice(0, 300))
    }
  }
  return { errors }
})
