<script setup lang="ts">
// 新增或修改一筆規劃：群組、專案、標題、時間、要發的帳號
const open = defineModel<boolean>({ required: true })
const props = defineProps<{ post?: Post, defaultDay?: string }>()
const emit = defineEmits<{ saved: [post: Post] }>()
const boot = useBoot()
const form = reactive({ groupId: 0, projectId: null as number | null, title: '', day: '', time: '12:00', accountIds: [] as number[], note: '' })
const error = ref('')
const busy = ref(false)

watch(open, (value) => {
  if (!value) return
  error.value = ''
  const p = props.post
  Object.assign(form, p
    ? { groupId: p.groupId, projectId: p.projectId, title: p.title, day: p.scheduledAt.slice(0, 10), time: p.scheduledAt.slice(11), accountIds: p.targets.map(t => t.accountId), note: p.note }
    : { groupId: boot.value.groups[0]?.id ?? 0, projectId: null, title: '', day: props.defaultDay ?? todayTaipei(), time: '12:00', accountIds: [], note: '' })
})
const group = computed(() => boot.value.groups.find(g => g.id === form.groupId))
// 只列出被授權使用這個群組的專案
const projects = computed(() => boot.value.projects.filter(p => p.grants.some(g => g.groupId === form.groupId)))
watch(() => form.groupId, () => {
  if (props.post) return
  form.accountIds = []
  form.projectId = null
})

async function save() {
  busy.value = true
  error.value = ''
  try {
    const body = { groupId: form.groupId, projectId: form.projectId, title: form.title, scheduledAt: `${form.day}T${form.time}`, accountIds: form.accountIds, note: form.note }
    const saved = props.post
      ? await api<Post>(`/api/posts/${props.post.id}`, { method: 'PATCH', body })
      : await api<Post>('/api/posts', { method: 'POST', body })
    open.value = false
    emit('saved', saved)
    if (saved.conflicts.length) notify(`已儲存，但有撞期：${saved.conflicts[0]}`)
  }
  catch (e: any) {
    error.value = e.message
  }
  busy.value = false
}
</script>

<template>
  <AppDialog v-model="open" :title="post ? '修改規劃' : '新增規劃'" :error="error" :busy="busy" @submit="save">
    <div v-if="!boot.groups.length" class="note">還沒有帳號群組，請先到「帳號群組」建立群組並加入帳號。</div>
    <template v-else>
      <label class="field">標題
        <input v-model="form.title" type="text" maxlength="120" required>
      </label>
      <div class="row" style="align-items: flex-end">
        <label class="field grow">群組
          <select v-model="form.groupId" :disabled="!!post">
            <option v-for="g in boot.groups" :key="g.id" :value="g.id">{{ g.name }}</option>
          </select>
        </label>
        <label class="field grow">專案
          <select v-model="form.projectId">
            <option :value="null">自己排的（不屬於專案）</option>
            <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
      </div>
      <div class="row" style="align-items: flex-end">
        <label class="field grow">日期
          <input v-model="form.day" type="date" required>
        </label>
        <label class="field grow">時間（台北）
          <input v-model="form.time" type="time" required>
        </label>
      </div>
      <fieldset>
        <legend>要發的帳號</legend>
        <label v-for="a in group?.accounts" :key="a.id" class="check">
          <input v-model="form.accountIds" type="checkbox" :value="a.id">{{ PLATFORMS[a.platform].label }}・{{ a.name }}
        </label>
        <div v-if="!group?.accounts.length" class="note">這個群組還沒有帳號。</div>
      </fieldset>
      <label class="field">備註（選填）
        <textarea v-model="form.note" rows="2" maxlength="2000" />
      </label>
    </template>
  </AppDialog>
</template>
