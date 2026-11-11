#!/usr/bin/env node
// 建立會員或重設密碼（給第一個管理員，或管理員自己忘記密碼時用；平常在「會員管理」頁操作就好）。
//
//   node scripts/set-user.mjs <帳號> [--admin] [--remote]
//
// 密碼不放在指令列（會留在 shell 紀錄）：從環境變數 OCC_USER_PASSWORD 讀，沒有的話從 stdin 讀一行。
// 預設寫本機的 D1；加 --remote 才是正式環境。
import { execFileSync } from 'node:child_process'
import { pbkdf2Sync, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const username = (args.find(a => !a.startsWith('--')) ?? '').trim().toLowerCase()
if (!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username)) {
  console.error('用法：node scripts/set-user.mjs <帳號> [--admin] [--remote]（帳號 3–32 個英數字，可含 _ . -）')
  process.exit(1)
}
const password = process.env.OCC_USER_PASSWORD ?? readFileSync(0, 'utf8').split('\n')[0]
if (!password || password.length < 8) {
  console.error('密碼至少 8 個字（用環境變數 OCC_USER_PASSWORD 或 stdin 提供）')
  process.exit(1)
}

// 跟 server/utils/passwords.ts 同一種格式
const ITERATIONS = 20000
const salt = randomBytes(16)
const hash = `pbkdf2$${ITERATIONS}$${salt.toString('hex')}$${pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256').toString('hex')}`
const isAdmin = args.includes('--admin') ? 1 : 0
// 帳號已通過上面的格式檢查、hash 只有英數字與 $，可以直接放進 SQL。
// 既有帳號只換密碼（加 --admin 時順便升成管理員），並解除登入鎖定
const sql = [
  `insert into users (username, password_hash, is_admin, created_at) values ('${username}', '${hash}', ${isAdmin}, '${new Date().toISOString()}')`
  + ` on conflict(username) do update set password_hash = excluded.password_hash${isAdmin ? ', is_admin = 1' : ''}`,
  `delete from login_failures where username = '${username}'`,
].join('; ')

const target = args.includes('--remote') ? '--remote' : '--local'
execFileSync('pnpm', ['exec', 'wrangler', 'd1', 'execute', 'DB', target, '--command', sql], { stdio: ['ignore', 'ignore', 'inherit'] })
console.log(`已設定 ${username}${isAdmin ? '（管理員）' : ''} 的密碼（${target === '--remote' ? '正式環境' : '本機'}）`)
