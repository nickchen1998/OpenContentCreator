// 把留言紀錄整理成「對話」：一個人在一則貼文底下的留言，加上之後所有往來（他的回覆、我的回覆、別人插話）。
// 網頁（對話卡片）與伺服器（算待回覆的數量）共用。

export interface ConvRow {
  id: number
  accountId: number
  externalId: string | null
  externalPostId: string
  parentExternalId: string
  mine: boolean
  status: string
  createdAt: string
}

export interface ConvGroup<T> {
  key: string
  /** 起頭的那則留言 */
  root: T
  /** 回在哪裡：0 是主文，1 以上是第幾則子文（Threads 的串文才有） */
  part: number
  /** 這串對話裡的每一則，舊的在前 */
  rows: T[]
  last: T
  /** 最後一句是對方說的、而且還沒處理 */
  waiting: boolean
}

/** 這則還要不要回：對方說的，而且不是已經回過（舊紀錄的回覆記在同一筆上）或標成不用回 */
export const needsReply = (row: ConvRow) => !row.mine && row.status !== 'sent' && row.status !== 'handled'

/**
 * rows 可以混著多則貼文。回傳每則貼文的子文串（帳號自己接在主文下面的貼文，照順序）與所有對話（最近有動靜的在前）。
 * 子文：自己發的、而且是回在主文或另一則子文底下。對話的起頭：別人發的、回在主文或子文底下。
 */
export function groupConversations<T extends ConvRow>(rows: T[]) {
  const byPost = new Map<string, T[]>()
  for (const row of rows) {
    const key = `${row.accountId}:${row.externalPostId}`
    if (!byPost.has(key)) byPost.set(key, [])
    byPost.get(key)!.push(row)
  }
  const parts = new Map<string, T[]>()
  const conversations: ConvGroup<T>[] = []
  for (const [postKey, list] of byPost) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id)
    const byExternal = new Map(list.filter(r => r.externalId).map(r => [r.externalId!, r]))
    const partIndex = new Map<string, number>()
    const postParts: T[] = []
    for (const row of list) {
      if (row.mine && row.externalId && (row.parentExternalId === '' || partIndex.has(row.parentExternalId))) {
        postParts.push(row)
        partIndex.set(row.externalId, postParts.length)
      }
    }
    if (postParts.length) parts.set(postKey, postParts)
    const groups = new Map<number, ConvGroup<T>>()
    const rootOf = (row: T): T => {
      let current = row
      for (let depth = 0; depth < 50; depth++) {
        if (current.parentExternalId === '' || partIndex.has(current.parentExternalId)) return current
        const parent = byExternal.get(current.parentExternalId)
        // 上一層沒有記錄到（例如太舊）：就從這則開始算一串
        if (!parent) return current
        current = parent
      }
      return current
    }
    for (const row of list) {
      if (row.externalId && partIndex.has(row.externalId)) continue
      const root = rootOf(row)
      if (!groups.has(root.id)) groups.set(root.id, { key: `${postKey}:${root.id}`, root, part: partIndex.get(root.parentExternalId) ?? 0, rows: [], last: root, waiting: false })
      groups.get(root.id)!.rows.push(row)
    }
    for (const group of groups.values()) {
      group.last = group.rows[group.rows.length - 1]!
      group.waiting = needsReply(group.last)
      conversations.push(group)
    }
  }
  conversations.sort((a, b) => b.last.createdAt.localeCompare(a.last.createdAt) || b.last.id - a.last.id)
  return { parts, conversations }
}
