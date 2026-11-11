import type { SQL } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { accountPosts, postStats } from '../database/schema'

/**
 * 把符合條件的貼文「現在存在 account_posts 裡的數字」記成今天的一筆（post_stats）。回傳的是還沒執行的 statement：
 * 跟更新 account_posts 的寫入放進同一個 batch，排在它們後面，記下來的就是剛更新完的數字。
 * 整句只有一個 statement、參數不隨貼文數增加（D1 一句最多 100 個參數）；今天已經記過而且數字沒變就不寫。
 */
export function snapshotPostStats(where: SQL) {
  const db = useDb()
  const ex = (column: string) => sql.raw(`excluded.${column}`)
  return db.insert(postStats)
    // 欄位順序要跟 post_stats 的定義一樣
    .select(db.select({
      postId: accountPosts.id,
      day: sql<string>`${todayTaipei()}`.as('day'),
      views: accountPosts.views,
      likes: accountPosts.likes,
      comments: accountPosts.comments,
      shares: accountPosts.shares,
      saves: accountPosts.saves,
    }).from(accountPosts).where(where))
    .onConflictDoUpdate({
      target: [postStats.postId, postStats.day],
      set: { views: ex('views'), likes: ex('likes'), comments: ex('comments'), shares: ex('shares'), saves: ex('saves') },
      setWhere: sql`${postStats.views} != excluded.views or ${postStats.likes} != excluded.likes or ${postStats.comments} != excluded.comments or ${postStats.shares} != excluded.shares or ${postStats.saves} != excluded.saves`,
    })
}
