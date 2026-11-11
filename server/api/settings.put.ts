import { settings } from '../database/schema'

export default defineEventHandler(async (event) => {
  const body = await bodyOf(event)
  const values = {
    minGapHours: int(body.minGapHours, '間隔時數', 0, 72),
    maxPerDay: int(body.maxPerDay, '每天上限', 0, 50),
    replyPerHour: int(body.replyPerHour, '每小時回覆上限', 0, 1000),
  }
  const db = useDb()
  await batchWrites(Object.entries(values).map(([key, v]) =>
    db.insert(settings).values({ key, value: String(v) }).onConflictDoUpdate({ target: settings.key, set: { value: String(v) } })))
  return values
})
