<script setup lang="ts">
// 公開頁面（不用登入）：Meta 等平台發佈應用程式時要求填隱私權政策網址
definePageMeta({ layout: false })
</script>

<template>
  <div style="max-width: 760px; margin: 0 auto; padding: 48px 20px 80px; display: flex; flex-direction: column; gap: 18px">
    <div class="row" style="gap: 12px">
      <img src="/logo.png" alt="" width="40" height="40">
      <h1>OpenContentCreator 隱私權政策</h1>
    </div>
    <p class="small muted">最後更新：2026 年 11 月 11 日</p>

    <section class="card">
      <h2>這是什麼服務</h2>
      <p>OpenContentCreator 是社群內容的排程、素材管理與自動回覆工具。帳號由管理員建立，沒有開放註冊；每位會員只能存取自己的資料。</p>
    </section>

    <section class="card">
      <h2>我們處理哪些資料</h2>
      <ul style="margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px">
        <li>會員的登入帳號與密碼雜湊。</li>
        <li>會員自行建立的排程、文案、素材檔案與回覆規則。</li>
        <li>會員連結的社群帳號（Instagram、Facebook 粉絲專頁、Threads）的存取權杖與應用程式密鑰，加密後儲存。</li>
        <li>上述社群帳號收到的留言與私訊：留言者的公開名稱或平台識別碼、留言或訊息內容、所屬貼文，以及系統送出的回覆。</li>
        <li>會員已發佈貼文的成效數字（觀看、按讚、留言、分享、收藏）。</li>
      </ul>
    </section>

    <section class="card">
      <h2>資料怎麼使用</h2>
      <p>留言與私訊只用來比對會員自己設定的規則，並代表該會員的帳號送出他事先寫好的回覆。成效數字只顯示給該會員。我們不販售資料、不用於廣告，也不提供給其他會員或第三方。</p>
    </section>

    <section class="card">
      <h2>資料存放與保存</h2>
      <p>資料存放在 Cloudflare（Workers、D1、R2）。會員中斷某個社群帳號的連結時，該帳號的權杖會立即刪除；會員帳號刪除時，其所有資料（含素材、留言紀錄與規則）一併刪除。</p>
    </section>

    <section class="card">
      <h2>刪除資料</h2>
      <p>會員可以在服務內自行刪除留言紀錄、規則、貼文與素材，或中斷社群帳號的連結。曾經在會員的貼文留言或傳訊的使用者，若希望刪除相關紀錄，請直接聯絡該社群帳號的經營者，由他在服務內刪除。</p>
    </section>

    <section class="card">
      <h2>聯絡</h2>
      <p>對這份政策或你的資料有疑問，請聯絡為你開通帳號的管理員。</p>
    </section>
  </div>
</template>
