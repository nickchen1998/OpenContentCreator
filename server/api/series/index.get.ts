// ?platform= 只算那個平台的貼文與留言（儀表板的平台篩選用）
export default defineEventHandler(event => loadSeries(uidOf(event), queryPlatform(event)))
