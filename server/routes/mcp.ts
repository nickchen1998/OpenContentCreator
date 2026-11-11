import { eq } from 'drizzle-orm'
import { projects } from '../database/schema'
import type { McpContext } from '../mcp/tools'
import { TOOLS } from '../mcp/tools'

// MCP（Streamable HTTP，無狀態）：每個專案的 Claude 用自己的 token 連進來（Authorization: Bearer occ_…）。
// 只回 JSON、不開 SSE，所以 GET 回 405；工具很少，JSON-RPC 直接在這裡處理，不用 SDK。
const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']

interface RpcRequest { jsonrpc: '2.0', id?: string | number | null, method: string, params?: Record<string, any> }

export default defineEventHandler(async (event) => {
  if (event.method !== 'POST') {
    setResponseHeader(event, 'Allow', 'POST')
    throw createError({ statusCode: 405, message: 'Method Not Allowed' })
  }
  const token = getHeader(event, 'authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
  const [row] = token
    ? await useDb().select({ id: projects.id, ownerId: projects.ownerId }).from(projects).where(eq(projects.tokenHash, await sha256(token)))
    : []
  if (!row || row.ownerId == null) {
    setResponseHeader(event, 'WWW-Authenticate', 'Bearer realm="mcp"')
    throw createError({ statusCode: 401, message: '需要專案的 MCP token' })
  }
  const body = await readBody(event).catch(() => null)
  if (!body || typeof body !== 'object') return rpcError(null, -32700, 'Parse error')

  // boot 等到真的要跑工具時才讀
  let ctx: McpContext | undefined
  const context = async () => {
    if (!ctx) {
      // 專案屬於哪個會員，就只看得到那個會員的資料
      const boot = await loadBoot(row.ownerId!)
      ctx = { boot, project: boot.projects.find(p => p.id === row.id)! }
    }
    return ctx
  }
  if (Array.isArray(body)) {
    const replies = []
    for (const message of body) {
      const reply = await handle(message, context)
      if (reply) replies.push(reply)
    }
    if (replies.length) return replies
  }
  else {
    const reply = await handle(body, context)
    if (reply) return reply
  }
  // 只有通知（沒有 id）時不回內容
  setResponseStatus(event, 202)
  return null
})

async function handle(message: RpcRequest, context: () => Promise<McpContext>) {
  const id = message?.id
  if (message?.jsonrpc !== '2.0' || typeof message.method !== 'string') return rpcError(id ?? null, -32600, 'Invalid Request')
  if (id === undefined) return null // 通知
  switch (message.method) {
    case 'initialize': {
      const requested = message.params?.protocolVersion
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'opencontentcreator', title: 'OpenContentCreator', version: '1.0.0' },
        instructions: 'OpenContentCreator：社群發文的排程協調。這個連線代表一個專案：先用 list_accounts 看可以使用的帳號，用 list_schedule / find_open_slots / check_conflicts 找時段，再用 propose_post 送出提案。提案要等站主確認才會排入；系統不會代為發文。時間一律是台北時間 YYYY-MM-DDTHH:MM。',
      })
    }
    case 'ping':
      return rpcResult(id, {})
    case 'tools/list':
      return rpcResult(id, {
        tools: TOOLS.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { readOnlyHint: t.readOnly, destructiveHint: false, idempotentHint: t.readOnly, openWorldHint: false },
        })),
      })
    case 'tools/call': {
      const tool = TOOLS.find(t => t.name === message.params?.name)
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${message.params?.name}`)
      try {
        const result = await tool.run(message.params?.arguments ?? {}, await context())
        return rpcResult(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] })
      }
      catch (error: any) {
        // 參數不對、沒權限這類錯誤回給模型看（isError），它才知道怎麼修正
        const expected = typeof error?.statusCode === 'number' && error.statusCode < 500
        if (!expected) console.error('mcp tool failed', tool.name, error)
        return rpcResult(id, { content: [{ type: 'text', text: expected ? error.message : '伺服器發生錯誤，請稍後再試' }], isError: true })
      }
    }
    default:
      return rpcError(id, -32601, `Method not found: ${message.method}`)
  }
}

const rpcResult = (id: RpcRequest['id'], result: unknown) => ({ jsonrpc: '2.0', id, result })
const rpcError = (id: RpcRequest['id'], code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } })
