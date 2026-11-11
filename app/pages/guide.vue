<script setup lang="ts">
// 連結平台的設定教學。平常的畫面不放說明文字，要查的時候才來這裡。
const SECTIONS = [
  {
    id: 'instagram',
    title: 'Instagram',
    can: '留言回覆、留言後私訊、私訊自動回覆、成效同步',
    need: 'Instagram 專業帳號（商業或創作者）',
    steps: [
      '到 developers.facebook.com 建立應用程式，加入「Instagram」產品，選「使用 Instagram 登入設定 API」。',
      '在「產生存取權杖」加入你的 Instagram 帳號並授權，複製產生的 Access token。',
      '到「應用程式設定 › 基本資料」複製「應用程式密鑰」（App secret）。',
      '回到這裡的「帳號群組」，在該帳號按「連結」，貼上 Access token 與 App secret。',
      '在 Meta 應用程式的 Instagram 設定頁找到 Webhooks，貼上連結視窗裡的「回呼網址」與「驗證權杖」，訂閱 comments 與 messages。',
      '把應用程式切換到「上線」模式。',
    ],
    scopes: ['instagram_business_basic', 'instagram_business_manage_comments', 'instagram_business_manage_messages', 'instagram_business_manage_insights'],
  },
  {
    id: 'facebook',
    title: 'Facebook 粉專',
    can: '留言回覆、留言後私訊、私訊自動回覆、成效同步',
    need: '你是該粉專的管理員',
    steps: [
      '到 developers.facebook.com 建立應用程式（類型選「商家」），加入「Messenger」與「Webhooks」產品。',
      '在 Messenger 的設定頁加入你的粉專，產生粉專的 Page access token 並複製。',
      '到「應用程式設定 › 基本資料」複製「應用程式密鑰」（App secret）。',
      '回到這裡的「帳號群組」，在該帳號按「連結」，貼上 Page access token 與 App secret。',
      '在 Webhooks 產品選「Page」，貼上連結視窗裡的「回呼網址」與「驗證權杖」，訂閱 feed 與 messages。',
      '把應用程式切換到「上線」模式。',
    ],
    scopes: ['pages_manage_metadata', 'pages_read_engagement', 'pages_read_user_content', 'pages_manage_engagement', 'pages_messaging', 'read_insights'],
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
