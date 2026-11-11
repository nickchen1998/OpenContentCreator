<script setup lang="ts">
// 連結平台的設定教學。平常的畫面不放說明文字，要查的時候才來這裡。
const SECTIONS = [
  {
    id: 'instagram',
    title: 'Instagram',
    can: '留言回覆、留言後私訊、成效同步',
    need: 'Instagram 專業帳號（商業或創作者）、商家資產管理組合',
    steps: [
      '到 developers.facebook.com 建立應用程式，使用案例勾選「管理 Instagram 的訊息和內容」。',
      '進入該使用案例的「自訂」，在「API setup with Unified login」把應用程式連結到你自己的商家資產管理組合（沒有的話先建立一個，不需要驗證）。',
      '選「Create new configuration」建立設定，權限加上 instagram_manage_insights。',
      '在「Generate access tokens」按「Add account」邀請你的 Instagram 帳號當測試人員，再到 Instagram 網頁版「設定 › 網站權限 › 應用程式和網站 › 測試人員邀請」接受。',
      '按「產生權杖」產生 Access token 並複製（只會顯示一次）。',
      '在同一頁最上方找到「Instagram 應用程式密鑰」並複製。注意不是「應用程式設定 › 基本資料」的那一把，用錯的話留言會進不來。',
      '回到這裡的「帳號群組」，在該帳號按「連結」，貼上 Access token 與 Instagram 應用程式密鑰。',
      '回到 Meta 的「設定 Webhooks」，貼上連結視窗裡的「回呼網址」與「驗證權杖」，訂閱 comments。',
    ],
    scopes: ['instagram_basic', 'instagram_manage_comments', 'instagram_manage_messages', 'instagram_manage_insights'],
  },
  {
    id: 'facebook',
    title: 'Facebook 粉專',
    can: '留言回覆、留言後私訊、成效同步',
    need: '你是該粉專的管理員',
    steps: [
      '到 developers.facebook.com 建立應用程式，使用案例勾選「透過 Messenger from Meta 與顧客互動」與「管理粉絲專頁的所有內容」。',
      '在這兩個使用案例的「權限和功能」把下面列的權限都加上（狀態變成「可供測試」）。',
      '在「Messenger API 設定」的「設定 Webhooks」貼上連結視窗裡的「回呼網址」與「驗證權杖」，訂閱 feed；再到「產生存取權杖」連結你的粉專，按「新增訂閱」同樣勾 feed。那一頁的「產生」按鈕不要用，它給的權杖只有私訊權限。',
      '開「工具 › 圖形 API 測試工具」：Meta 應用程式選你的 App，「用戶或粉絲專頁」選「取得用戶存取權杖」，把下面列的權限都加進去，按「Generate Access Token」並勾選你的粉專。複製產生的權杖。',
      '到「應用程式設定 › 基本資料」複製「應用程式編號」與「應用程式密鑰」。',
      '回到這裡的「帳號群組」，在該帳號按「連結」，貼上權杖、應用程式編號與應用程式密鑰。系統會自動換成不會到期的粉專權杖。',
      '到左側選單的「發佈」把應用程式發佈上線（隱私權政策網址可以填本站的 /privacy）。沒發佈的話粉專的留言與私訊不會送過來。',
    ],
    scopes: ['business_management', 'pages_show_list', 'pages_manage_metadata', 'pages_read_engagement', 'pages_read_user_content', 'pages_manage_engagement', 'pages_messaging', 'read_insights'],
  },
  {
    id: 'threads',
    title: 'Threads',
    can: '留言回覆（每 5 分鐘檢查一次）、成效同步。Threads 沒有私訊 API。',
    need: 'Threads 帳號',
    steps: [
      '到 developers.facebook.com 建立應用程式，使用案例選「存取 Threads API」。',
      '在「應用程式角色」把自己的 Threads 帳號加為 Threads 測試人員，並到 Threads 的「設定 › 帳號 › 網站權限」接受邀請。',
      '在 Threads 使用案例的設定頁用「用戶權杖產生器」產生 Access token 並複製。',
      '回到這裡的「帳號群組」，在該帳號按「連結」，貼上 Access token。',
    ],
    scopes: ['threads_basic', 'threads_read_replies', 'threads_manage_replies', 'threads_manage_insights'],
  },
]
</script>

<template>
  <section v-for="s in SECTIONS" :id="s.id" :key="s.id" class="card" style="scroll-margin-top: 72px">
    <h2>{{ s.title }}</h2>
    <div class="row" style="gap: 8px 20px; align-items: baseline">
      <span class="small"><span class="muted">可以做　</span>{{ s.can }}</span>
      <span class="small"><span class="muted">需要　</span>{{ s.need }}</span>
    </div>
    <ol style="margin: 0; padding-left: 22px; display: flex; flex-direction: column; gap: 8px; font-size: 14px">
      <li v-for="step in s.steps" :key="step">{{ step }}</li>
    </ol>
    <div class="col" style="gap: 6px">
      <span class="small muted">產生權杖時要勾選的權限</span>
      <div class="row"><code v-for="scope in s.scopes" :key="scope" class="pl">{{ scope }}</code></div>
    </div>
  </section>
  <section class="card">
    <h2>YouTube</h2>
    <p class="small muted">即將支援</p>
  </section>
</template>
