import { collections } from '../../database/schema'

// 建立系列，可以同時放進一批貼文
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const body = await bodyOf(event)
  const name = str(body.name, '系列名稱', 40)
  const postIds = await ownedPostIds(uid, body.postIds)
  const [row] = await useDb().insert(collections).values({ ownerId: uid, name, createdAt: nowIso() }).returning({ id: collections.id })
  await addToCollection(row!.id, postIds)
  return { id: row!.id }
})
