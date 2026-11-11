// 公開頁面的編輯狀態：代號、是否已發布、草稿、草稿的預覽
export default defineEventHandler(event => pageState(uidOf(event)))
