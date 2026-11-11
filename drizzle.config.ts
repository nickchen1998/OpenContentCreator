import { defineConfig } from 'drizzle-kit'

// 只用來從 schema 產生 D1 migration SQL。套用一律走 `wrangler d1 migrations apply`：
// 本機加 --local；正式環境（--remote）是改 prod schema，要先確認再執行。
export default defineConfig({
  dialect: 'sqlite',
  schema: './server/database/schema.ts',
  out: './server/database/migrations',
})
