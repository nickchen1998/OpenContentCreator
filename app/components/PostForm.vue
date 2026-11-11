<script setup lang="ts">
// 新增或修改一筆規劃：專案、標題、時間、要發的帳號
const open = defineModel<boolean>({ required: true })
const props = defineProps<{ post?: Post, defaultDay?: string }>()
const emit = defineEmits<{ saved: [post: Post] }>()
const boot = useBoot()
const form = reactive({ projectId: null as number | null, title: '', day: '', time: '12:00', accountIds: [] as number[], note: '' })
const error = ref('')
const busy = ref(false)

watch(open, (value) => {
  if (!value) return
  error.value = ''
  const p = props.post
  Object.assign(form, p
    ? { projectId: p.projectId, title: p.title, day: p.scheduledAt.slice(0, 10), time: p.scheduledAt.slice(11), accountIds: p.targets.map(t => t.accountId), note: p.note }
    : { projectId: null, title: '', day: props.defaultDay ?? todayTaipei(), time: '12:00', accountIds: [], note: '' })
})
const { accounts } = useLookup()

async function save() {
  busy.value = true
  error.value = ''
  try {
    const body = { projectId: form.projectId, title: form.title, scheduledAt: `${form.day}T${form.time}`, accountIds: form.accountIds, note: form.note }
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
    <div v-if="!accounts.length" class="note">請先到「帳號」新增帳號</div>
    <template v-else>
      <label class="field">標題
        <input v-model="form.title" type="text" maxlength="120" required>
      </label>
      <label class="field">專案
          <select v-model="form.projectId">
            <option :value="null">不屬於專案</option>
            <option v-for="p in boot.projects" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
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
        <label v-for="a in accounts" :key="a.id" class="check">
          <input v-model="form.accountIds" type="checkbox" :value="a.id"><PlatformIcon :platform="a.platform" label />{{ a.name }}
        </label>
      </fieldset>
      <label class="field">備註（選填）
        <textarea v-model="form.note" rows="2" maxlength="2000" />
      </label>
    </template>
  </AppDialog>
</template>
