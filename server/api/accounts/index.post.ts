import { accounts } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const body = await bodyOf(event)
  const boot = await loadBoot(uidOf(event))
  const groupId = int(body.groupId, '群組', 1)
  if (!boot.groups.some(g => g.id === groupId)) throw bad('找不到這個群組')
  if (!isPlatform(body.platform)) throw bad('請選擇平台')
  const [row] = await useDb().insert(accounts).values({ groupId, platform: body.platform, name: str(body.name, '帳號名稱', 60) }).returning()
  return row
})
