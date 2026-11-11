import { eq } from 'drizzle-orm'
import { assets } from '../../database/schema'

// 下載素材。?inline=1 給縮圖與預覽用；預設是附件下載
export default defineEventHandler(async (event) => {
  const [asset] = await useDb().select().from(assets).where(eq(assets.id, idParam(event)))
  if (!asset) throw notFound('素材')
  const object = await useMedia().get(asset.r2Key)
  if (!object) throw notFound('素材')
  // 使用者上傳的內容一律不讓瀏覽器當成網頁執行：只有圖片、影片、音訊可以 inline
  const inline = getQuery(event).inline === '1' && /^(image\/(png|jpeg|gif|webp|avif)|video\/|audio\/)/.test(asset.contentType)
  return new Response(object.body, {
    headers: {
      'Content-Type': inline ? asset.contentType : 'application/octet-stream',
      'Content-Length': String(object.size),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(asset.filename)}`,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})
