import { and, eq, gte, inArray, lte } from 'drizzle-orm'
import { posts, postTargets } from '../database/schema'

/** 某個帳號上被占用的一個時段 */
export interface Slot {
  postId: number
  title: string
  accountId: number
  at: string
  status: 'scheduled' | 'pending'
  priority: number
}

export async function loadSlots(boot: Boot, fromDay: string, toDay: string): Promise<Slot[]> {
  const rows = await useDb()
    .select({ postId: posts.id, title: posts.title, accountId: postTargets.accountId, at: posts.scheduledAt, status: posts.status, projectId: posts.projectId, groupId: posts.groupId })
    .from(postTargets)
    .innerJoin(posts, eq(posts.id, postTargets.postId))
    .where(and(inArray(posts.status, ['scheduled', 'pending']), gte(posts.scheduledAt, `${fromDay}T00:00`), lte(posts.scheduledAt, `${toDay}T23:59`)))
  return rows.map(r => ({ postId: r.postId, title: r.title, accountId: r.accountId, at: r.at, status: r.status as Slot['status'], priority: priorityOf(boot, r.projectId, r.groupId) }))
}

export interface Candidate {
  postId?: number
  accountIds: number[]
  at: string
  status: 'scheduled' | 'pending'
  priority: number
}

/**
 * 協調規則（都以單一帳號計算，不同群組的帳號互不影響）：
 * - 同一個帳號的兩則貼文至少間隔 minGapHours 小時
 * - 每個帳號每天最多 maxPerDay 則
 * 已規劃的貼文一定算數；提案之間則是優先序高的（數字小）擋住低的，同優先序先送的擋住後送的。
 */
export function findConflicts(c: Candidate, slots: Slot[], boot: Boot): string[] {
  const reasons: string[] = []
  const { minGapHours, maxPerDay } = boot.rules
  const at = atMinutes(c.at)
  const day = c.at.slice(0, 10)
  for (const accountId of c.accountIds) {
    const others = slots.filter(s => s.accountId === accountId && s.postId !== c.postId && blocks(s, c))
    const label = accountLabel(boot, accountId)
    for (const s of others) {
      const gap = Math.abs(atMinutes(s.at) - at)
      if (gap < minGapHours * 60) {
        reasons.push(gap === 0
          ? `${label}：與「${s.title}」排在同一時段`
          : `${label}：與「${s.title}」（${s.at.slice(11)}）間隔不到 ${minGapHours} 小時`)
      }
    }
    const sameDay = others.filter(s => s.at.slice(0, 10) === day).length
    if (maxPerDay > 0 && sameDay >= maxPerDay) reasons.push(`${label}：${fmtDay(day)} 已經有 ${sameDay} 則，超過每天 ${maxPerDay} 則的上限`)
  }
  return reasons
}

function blocks(s: Slot, c: Candidate) {
  if (s.status === 'scheduled') return true
  if (c.status === 'scheduled') return false
  if (s.priority !== c.priority) return s.priority < c.priority
  return c.postId == null || s.postId < c.postId
}

/** 從 fromAt 之後找出符合協調規則的整點時段（08:00–22:00），最多看 14 天。 */
export function findOpenSlots(c: Omit<Candidate, 'at'>, fromAt: string, slots: Slot[], boot: Boot, count = 3): string[] {
  const found: string[] = []
  let minutes = Math.floor(atMinutes(fromAt) / 60) * 60 + 60
  const end = minutes + 14 * 24 * 60
  for (; minutes < end && found.length < count; minutes += 60) {
    const at = minutesToAt(minutes)
    const hour = Number(at.slice(11, 13))
    if (hour < 8 || hour > 22) continue
    if (!findConflicts({ ...c, at }, slots, boot).length) found.push(at)
  }
  return found
}
