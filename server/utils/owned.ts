import type { H3Event } from 'h3'
import { and, eq } from 'drizzle-orm'
import { accounts, assets, comments, groups, posts, postTargets, projects, replyRules, users } from '../database/schema'

/** 目前登入的會員 id（由 server/middleware/auth.ts 放進來） */
export function uidOf(event: H3Event): number {
  const id = event.context.userId
  if (typeof id !== 'number') throw createError({ statusCode: 401, message: 'Unauthorized' })
  return id
}

export function requireAdmin(event: H3Event) {
  uidOf(event)
  if (event.context.isAdmin !== true) throw bad('只有管理員可以使用這個功能', 403)
}

// 以下都是「這筆資料是不是這個會員的」。資料經由群組歸屬到會員，所以每一個都 join 到 groups 比對 owner_id；
// 別人的資料一律當成不存在（404），不透露它存在。
const mine = (uid: number) => eq(groups.ownerId, uid)

export async function ownedPost(uid: number, id: number) {
  const [row] = await useDb().select({ id: posts.id, groupId: posts.groupId }).from(posts)
    .innerJoin(groups, eq(groups.id, posts.groupId)).where(and(eq(posts.id, id), mine(uid)))
  if (!row) throw notFound('貼文')
  return row
}

export async function ownedAsset(uid: number, id: number) {
  const [row] = await useDb().select({ asset: assets }).from(assets)
    .innerJoin(posts, eq(posts.id, assets.postId)).innerJoin(groups, eq(groups.id, posts.groupId))
    .where(and(eq(assets.id, id), mine(uid)))
  if (!row) throw notFound('素材')
  return row.asset
}

export async function ownedTarget(uid: number, id: number) {
  const [row] = await useDb().select({ id: postTargets.id }).from(postTargets)
    .innerJoin(posts, eq(posts.id, postTargets.postId)).innerJoin(groups, eq(groups.id, posts.groupId))
    .where(and(eq(postTargets.id, id), mine(uid)))
  if (!row) throw notFound('平台')
}

export async function ownedRule(uid: number, id: number) {
  const [row] = await useDb().select({ id: replyRules.id }).from(replyRules)
    .innerJoin(groups, eq(groups.id, replyRules.groupId)).where(and(eq(replyRules.id, id), mine(uid)))
  if (!row) throw notFound('規則')
}

export async function ownedComment(uid: number, id: number) {
  const [row] = await useDb().select({ id: comments.id }).from(comments)
    .innerJoin(accounts, eq(accounts.id, comments.accountId)).innerJoin(groups, eq(groups.id, accounts.groupId))
    .where(and(eq(comments.id, id), mine(uid)))
  if (!row) throw notFound('留言')
}

export async function ownedAccount(uid: number, id: number) {
  const [row] = await useDb().select({ id: accounts.id }).from(accounts)
    .innerJoin(groups, eq(groups.id, accounts.groupId)).where(and(eq(accounts.id, id), mine(uid)))
  if (!row) throw notFound('帳號')
}

/** 刪掉一個會員的所有資料（groups / projects 的 owner_id 外鍵沒有 cascade，要自己刪）。回傳要從 R2 清掉的 key。 */
export async function deleteUserData(uid: number) {
  const db = useDb()
  const keys = await db.select({ key: assets.r2Key }).from(assets)
    .innerJoin(posts, eq(posts.id, assets.postId)).innerJoin(groups, eq(groups.id, posts.groupId)).where(mine(uid))
  await db.batch([
    db.delete(groups).where(eq(groups.ownerId, uid)),
    db.delete(projects).where(eq(projects.ownerId, uid)),
    db.delete(users).where(eq(users.id, uid)),
  ])
  if (keys.length) await useMedia().delete(keys.map(k => k.key))
}
