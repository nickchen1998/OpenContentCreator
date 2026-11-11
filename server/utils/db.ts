import { env } from 'cloudflare:workers'
import type { SQL } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { drizzle } from 'drizzle-orm/d1'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'

// D1 binding 在同一個 isolate 裡不會變，建一次就好。不經過 H3Event，MCP handler 也能直接用。
let db: ReturnType<typeof drizzle> | undefined
export const useDb = () => (db ??= drizzle(env.DB))
export const useMedia = () => env.MEDIA

/** 筆數不定的一批寫入，一起放進一個交易（D1 的 batch 只算一次查詢）。 */
export function batchWrites(statements: BatchItem<'sqlite'>[]) {
  if (!statements.length) return Promise.resolve([])
  return useDb().batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
}

/** id 清單整包當成一個 JSON 參數（D1 單一 statement 最多 100 個參數）。 */
export const inIdList = (column: SQLiteColumn, ids: number[]): SQL =>
  sql`${column} in (select value from json_each(${JSON.stringify(ids)}))`
