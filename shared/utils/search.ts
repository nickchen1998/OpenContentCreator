// 貼文的關鍵字搜尋：用空白分開的每個詞都要出現（不分大小寫、全形半形視為相同）。
// 精選貼文的挑選視窗與貼文管理共用；清單本來就整份在瀏覽器裡，所以在瀏覽器裡篩，不打伺服器。
const fold = (text: string) => text.normalize('NFKC').toLowerCase()
export function keywordMatcher(query: string) {
  const terms = fold(query).split(/\s+/).filter(Boolean)
  return (text: string) => {
    if (!terms.length) return true
    const hay = fold(text)
    return terms.every(t => hay.includes(t))
  }
}
