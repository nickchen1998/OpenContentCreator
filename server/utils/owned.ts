import type { H3Event } from 'h3'
import { and, eq } from 'drizzle-orm'
import { accounts, assets, comments, posts, postTargets, projects, users } from '../database/schema'

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

// 以下都是「這筆資料是不是這個會員的」。別人的資料一律當成不存在（404），不透露它存在。

export async function ownedPost(uid: number, id: number) {
  const [row] = await useDb().select({ id: posts.id }).from(posts).where(and(eq(posts.id, id), eq(posts.ownerId, uid)))
  if (!row) throw notFound('貼文')
  return row
}

export async function ownedAsset(uid: number, id: number) {
  const [row] = await useDb().select({ asset: assets }).from(assets)
    .innerJoin(posts, eq(posts.id, assets.postId)).where(and(eq(assets.id, id), eq(posts.ownerId, uid)))
  if (!row) throw notFound('素材')
  return row.asset
}

export async function ownedTarget(uid: number, id: number) {
  const [row] = await useDb().select({ id: postTargets.id }).from(postTargets)
    .innerJoin(posts, eq(posts.id, postTargets.postId)).where(and(eq(postTargets.id, id), eq(posts.ownerId, uid)))
  if (!row) throw notFound('平台')
}

export async function ownedComment(uid: number, id: number) {
  const [row] = await useDb().select({ id: comments.id }).from(comments)
    .innerJoin(accounts, eq(accounts.id, comments.accountId)).where(and(eq(comments.id, id), eq(accounts.ownerId, uid)))
  if (!row) throw notFound('留言')
}

export async function ownedAccount(uid: number, id: number) {
  const [row] = await useDb().select({ id: accounts.id }).from(accounts).where(and(eq(accounts.id, id), eq(accounts.ownerId, uid)))
  if (!row) throw notFound('帳號')
}

/** 刪掉一個會員：帳號、貼文、規則、系列都有 cascade；專案的 owner_id 沒有，要自己刪。R2 上的素材也要清 */
export async function deleteUserData(uid: number) {
  const db = useDb()
  const keys = await db.select({ key: assets.r2Key }).from(assets).innerJoin(posts, eq(posts.id, assets.postId)).where(eq(posts.ownerId, uid))
  await db.batch([
    db.delete(projects).where(eq(projects.ownerId, uid)),
    db.delete(users).where(eq(users.id, uid)),
  ])
  if (keys.length) await useMedia().delete(keys.map(k => k.key))
}
