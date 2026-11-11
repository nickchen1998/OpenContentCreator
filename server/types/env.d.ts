// `cloudflare:workers` 只宣告用得到的部分（完整的 @cloudflare/workers-types 是全域宣告，會跟 Nuxt 的 lib 打架）。
// 要跟 wrangler.jsonc 的 binding 對上。
declare module 'cloudflare:workers' {
  interface R2Object {
    body: ReadableStream
    size: number
  }
  export const env: {
    DB: import('drizzle-orm/d1').AnyD1Database
    MEDIA: {
      get(key: string): Promise<R2Object | null>
      put(key: string, value: ArrayBuffer | ArrayBufferView | ReadableStream, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>
      delete(keys: string | string[]): Promise<void>
    }
  }
}
