<script setup lang="ts">
interface Member { id: number, username: string, isAdmin: boolean, createdAt: string }
interface Issued { kind: 'created' | 'reset', username: string, password: string }
const members = ref<Member[]>([])
const username = ref('')
const issued = ref<Issued>()
const copied = ref(false)
const busy = ref(false)
const { user } = useUserSession()

async function load() {
  members.value = await attempt(() => api<Member[]>('/api/users')) ?? []
}
onMounted(load)

async function create() {
  busy.value = true
  const result = await attempt(() => api<{ username: string, password: string }>('/api/users', { method: 'POST', body: { username: username.value } }))
  busy.value = false
  if (!result) return
  issued.value = { kind: 'created', ...result }
  copied.value = false
  username.value = ''
  await load()
}
async function reset(m: Member) {
  if (!confirm(`重設「${m.username}」的密碼？舊密碼會立刻失效。`)) return
  const result = await attempt(() => api<{ username: string, password: string }>(`/api/users/${m.id}/password`, { method: 'POST' }))
  if (result) {
    issued.value = { kind: 'reset', ...result }
    copied.value = false
  }
}
async function remove(m: Member) {
  if (!confirm(`刪除會員「${m.username}」？他的帳號、貼文、素材、專案與規則會全部刪除，無法復原。`)) return
  if (await attempt(() => api(`/api/users/${m.id}`, { method: 'DELETE' }), '已刪除')) await load()
}
async function copyCredentials() {
  const i = issued.value!
  await navigator.clipboard.writeText(`OpenContentCreator\n${location.origin}\n帳號：${i.username}\n密碼：${i.password}`).catch(() => {})
  copied.value = true
}
const isMe = (m: Member) => m.id === (user.value as { id?: number } | null)?.id
</script>

<template>
  <section v-if="issued" class="card warn fade-in">
    <div class="row between">
      <p class="card-title bold">{{ issued.kind === 'created' ? '帳號已建立' : '密碼已重設' }}：{{ issued.username }}</p>
      <button class="btn-text" type="button" @click="issued = undefined">關閉</button>
    </div>
    <div class="row" style="gap: 8px 16px">
      <span class="small muted">帳號</span><code class="box">{{ issued.username }}</code>
      <span class="small muted">密碼</span><code class="box" style="font-size: 16px; letter-spacing: 0.04em">{{ issued.password }}</code>
    </div>
    <div class="row" style="gap: 12px">
      <button class="btn primary" type="button" @click="copyCredentials">{{ copied ? '已複製' : '複製登入資訊' }}</button>
      <span class="small" style="color: var(--warn)">密碼只會顯示這一次</span>
    </div>
  </section>

  <section class="card">
    <p class="en-label">New member</p>
    <h2 style="margin-top: -6px">建立帳號</h2>
    <form class="row" style="align-items: flex-end; gap: 12px" @submit.prevent="create">
      <label class="field" style="flex: 1 1 260px">帳號
        <input v-model="username" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="32" required>
      </label>
      <button class="btn primary" type="submit" :disabled="busy || !username.trim()">建立並產生密碼</button>
    </form>
  </section>

  <section class="card shrink">
    <p class="en-label">All members</p>
    <h2 style="margin-top: -6px">會員清單</h2>
    <div class="table-scroll scroll">
      <table style="min-width: 520px">
        <thead><tr><th scope="col">帳號</th><th scope="col">角色</th><th scope="col">建立時間</th><th scope="col">操作</th></tr></thead>
        <tbody>
          <tr v-for="m in members" :key="m.id">
            <th scope="row">{{ m.username }}<span v-if="isMe(m)" class="pill muted" style="margin-left: 8px">你</span></th>
            <td><span class="pill" :class="{ muted: !m.isAdmin }">{{ m.isAdmin ? '管理員' : '會員' }}</span></td>
            <td>{{ m.createdAt.slice(0, 10) }}</td>
            <td>
              <div class="row">
                <button class="btn sm" type="button" :aria-label="`重設 ${m.username} 的密碼`" @click="reset(m)">重設密碼</button>
                <button v-if="!m.isAdmin" class="btn sm danger" type="button" :aria-label="`刪除 ${m.username}`" @click="remove(m)">刪除</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
