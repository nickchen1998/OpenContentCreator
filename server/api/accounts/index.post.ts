import { accounts } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const body = await bodyOf(event)
  if (!isPlatform(body.platform)) throw bad('請選擇平台')
  const [row] = await useDb().insert(accounts).values({ ownerId: uidOf(event), platform: body.platform, name: str(body.name, '帳號名稱', 60) })
    .returning({ id: accounts.id, platform: accounts.platform, name: accounts.name })
  return row
})
