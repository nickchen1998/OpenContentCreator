<script setup lang="ts">
// 公開頁面（不用登入）：Google 等平台申請應用程式時要求填服務條款網址
definePageMeta({ layout: false })
</script>

<template>
  <div style="max-width: 760px; margin: 0 auto; padding: 48px 20px 80px; display: flex; flex-direction: column; gap: 18px">
    <div class="row" style="gap: 12px">
      <img src="/logo.png" alt="" width="40" height="40">
      <h1>OpenContentCreator 服務條款</h1>
    </div>
    <p class="small muted">最後更新：2026 年 11 月 11 日</p>

    <section class="card">
      <h2>服務內容</h2>
      <p>OpenContentCreator 是社群內容的排程、素材管理、成效檢視與留言回覆工具。帳號由管理員建立，沒有開放註冊。使用本服務即表示你同意這份條款與<NuxtLink to="/privacy">隱私權政策</NuxtLink>。</p>
    </section>

    <section class="card">
      <h2>你的帳號與連結的社群帳號</h2>
      <ul style="margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px">
        <li>請妥善保管登入密碼；以你的帳號進行的操作由你負責。</li>
        <li>你只能連結自己擁有或有權管理的社群帳號（Instagram、Facebook 粉絲專頁、Threads、YouTube 頻道）。</li>
        <li>本服務代表你連結的帳號送出的回覆與私訊，內容由你設定或輸入，責任由你承擔。</li>
      </ul>
    </section>

    <section class="card">
      <h2>第三方平台</h2>
      <p>本服務透過各平台提供的 API 運作，你在使用對應功能時也必須遵守該平台的規範，包括 Meta 的平台條款與 <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube 服務條款</a>。連結 YouTube 頻道時，本服務使用 YouTube API 服務。平台變更或停止提供 API 時，對應的功能可能跟著改變或停止。</p>
    </section>

    <section class="card">
      <h2>不可以做的事</h2>
      <ul style="margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px">
        <li>發送垃圾訊息、騷擾、詐騙或違反法令的內容。</li>
        <li>違反各平台的使用規範，例如大量重複回覆、規避平台的頻率限制。</li>
        <li>嘗試存取其他會員的資料，或干擾服務的運作。</li>
      </ul>
    </section>

    <section class="card">
      <h2>服務的提供方式</h2>
      <p>本服務以現狀提供，不保證不中斷、沒有錯誤，也不保證自動回覆與成效數字的即時性與完整性。在法律允許的範圍內，因使用或無法使用本服務所生的損失，我們不負賠償責任。違反這份條款時，管理員可以停用帳號。</p>
    </section>

    <section class="card">
      <h2>終止與資料</h2>
      <p>你可以隨時中斷社群帳號的連結，或請管理員刪除你的帳號。帳號刪除時，你的資料會一併刪除，細節見隱私權政策。</p>
    </section>

    <section class="card">
      <h2>條款變更與聯絡</h2>
      <p>條款有修改時會更新這一頁上方的日期。對條款有疑問，請聯絡為你開通帳號的管理員。</p>
    </section>
  </div>
</template>
