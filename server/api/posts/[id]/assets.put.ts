import { assets } from '../../../database/schema'

// Nitro 的 Cloudflare preset 會先把整個 request body 讀進記憶體（Worker 記憶體上限 128MB），所以上限抓 60MB
const MAX_BYTES = 60 * 1024 * 1024

// 上傳一個素材：檔案內容就是 request body（不用 multipart，少一次解析與複製）。
// PUT /api/posts/:id/assets?filename=cover.jpg
export default defineEventHandler(async (event) => {
  const postId = idParam(event)
  const filename = str(getQuery(event).filename, '檔名', 200).replace(/[\\/\u0000-\u001F]/g, '_')
  const size = Number(getHeader(event, 'content-length'))
  if (!Number.isInteger(size) || size <= 0) throw bad('沒有檔案內容')
  if (size > MAX_BYTES) throw bad('單一檔案最大 60MB', 413)
  const db = useDb()
  await ownedPost(uidOf(event), postId)
  const contentType = getHeader(event, 'content-type') || 'application/octet-stream'
  const r2Key = `assets/${postId}/${crypto.randomUUID()}`
  const body = await readRawBody(event, false)
  if (!body?.byteLength) throw bad('沒有檔案內容')
  await useMedia().put(r2Key, body, { httpMetadata: { contentType } })
  const [row] = await db.insert(assets).values({ postId, r2Key, filename, contentType, size: body.byteLength, createdAt: nowIso() })
    .returning({ id: assets.id, postId: assets.postId, filename: assets.filename, contentType: assets.contentType, size: assets.size, note: assets.note })
  return row
})
