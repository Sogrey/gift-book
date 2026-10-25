<script setup lang="ts">
/** 首页：事项列表 / 新建事项 / 导入加密备份 */
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import type { BackupFile, EventKind } from '@/types'
import { useEventsStore } from '@/stores/events'
import { useUiStore } from '@/stores/ui'

const router = useRouter()
const events = useEventsStore()
const ui = useUiStore()

onMounted(() => {
  if (ui.theme !== 'red') ui.setTheme('red')
})

/* ---------- 新建 ---------- */
const showCreate = ref(false)
const form = ref({ name: '', kind: 'red' as EventKind, date: '', password: '', password2: '' })
const creating = ref(false)

function openCreate() {
  form.value = { name: '', kind: 'red', date: today(), password: '', password2: '' }
  showCreate.value = true
}

function today() {
  const d = new Date()
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function submitCreate() {
  const f = form.value
  if (!f.name.trim()) return ui.toast('请填写事项名称', 'warn')
  if (f.password.length < 4) return ui.toast('管理密码至少 4 位', 'warn')
  if (f.password !== f.password2) return ui.toast('两次密码不一致', 'warn')
  creating.value = true
  setTimeout(() => {
    try {
      const { event, sessionKeyHex } = events.createEvent({
        name: f.name,
        kind: f.kind,
        date: f.date || undefined,
        password: f.password,
      })
      // 创建成功即解锁，本会话免重输密码
      sessionStorage.setItem(`gb:session-key:${event.id}`, sessionKeyHex)
      ui.toast('事项已创建', 'success')
      showCreate.value = false
      router.push(`/event/${event.id}`)
    } finally {
      creating.value = false
    }
  }, 0)
}

/* ---------- 导入备份 ---------- */
const importInput = ref<HTMLInputElement>()

async function onImportFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const backup = JSON.parse(text) as BackupFile
    if (backup?.app !== 'gift-book-vue' || !backup?.meta?.salt || !backup?.payload) {
      throw new Error('format')
    }
    const event = events.createEventFromBackup({
      name: backup.meta.name,
      kind: backup.meta.kind ?? 'red',
      createdAt: backup.meta.createdAt ?? Date.now(),
      date: backup.meta.date,
      salt: backup.meta.salt,
      verifier: backup.meta.verifier,
    })
    localStorage.setItem(`gb:data:${event.id}`, backup.payload)
    ui.toast(`已导入「${event.name}」，请用原管理密码解锁`, 'success')
    router.push(`/event/${event.id}`)
  } catch (err) {
    console.error(err)
    ui.toast('备份文件无效或已损坏', 'error')
  } finally {
    importInput.value!.value = ''
  }
}

async function onRemove(id: string, name: string) {
  const ok = await ui.confirm({
    title: `删除事项「${name}」？`,
    message: '将同时删除该事项的全部加密数据，且无法恢复。\n建议先在事项内导出备份。',
    confirmText: '永久删除',
    danger: true,
  })
  if (ok) {
    events.removeEvent(id)
    ui.toast('已删除', 'success')
  }
}

function kindBadge(kind: EventKind) {
  return kind === 'white' ? { text: '白事', cls: 'bg-primary-soft text-primary-deep' } : { text: '红事', cls: 'bg-primary text-white' }
}

function fmtDate(ts: number) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
</script>

<template>
  <div class="mx-auto max-w-4xl px-4 py-10">
    <!-- 头部 -->
    <header class="mb-8 text-center">
      <div class="gb-title-kai text-5xl font-bold tracking-[0.3em]">电子礼簿</div>
      <p class="mt-3 text-sm text-ink-soft">
        纯本地运行 · 零后端 · AES-256 加密落库 —— 红白喜事礼金记账
      </p>
    </header>

    <!-- 操作栏 -->
    <div class="mb-5 flex flex-wrap items-center gap-2">
      <button class="gb-btn gb-btn-primary" @click="openCreate">＋ 新建事项</button>
      <button class="gb-btn gb-btn-ghost" @click="importInput?.click()">导入备份 (.giftbook.json)</button>
      <input ref="importInput" type="file" accept=".json,.giftbook,application/json" class="hidden" @change="onImportFile" />
      <span class="ml-auto text-xs text-ink-soft">数据仅存本机浏览器，请及时导出备份</span>
    </div>

    <!-- 事项列表 -->
    <div class="grid gap-3 sm:grid-cols-2">
      <div
        v-for="ev in events.sortedList"
        :key="ev.id"
        class="gb-card group cursor-pointer p-4 transition-shadow hover:shadow-md"
        :data-kind="ev.kind"
        @click="router.push(`/event/${ev.id}`)"
      >
        <div class="flex items-start gap-3">
          <div
            class="gb-title-kai flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl font-bold"
            :class="ev.kind === 'white' ? 'bg-primary-soft text-primary' : 'bg-primary text-white'"
          >
            礼
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <h3 class="gb-title-kai truncate text-lg font-bold">{{ ev.name }}</h3>
              <span class="shrink-0 rounded-full px-2 py-0.5 text-[11px]" :class="kindBadge(ev.kind).cls">
                {{ kindBadge(ev.kind).text }}
              </span>
            </div>
            <div class="mt-1 text-xs text-ink-soft">
              事项日期 {{ ev.date || fmtDate(ev.createdAt) }} · 创建于 {{ fmtDate(ev.createdAt) }}
            </div>
          </div>
          <button
            class="gb-btn gb-btn-danger px-2 py-1 text-xs opacity-0 transition-opacity group-hover:opacity-100"
            @click.stop="onRemove(ev.id, ev.name)"
          >
            删除
          </button>
        </div>
      </div>

      <div v-if="!events.list.length" class="col-span-full rounded-xl border border-dashed border-line py-16 text-center">
        <div class="gb-title-kai text-xl text-ink-soft">还没有事项</div>
        <p class="mt-2 text-sm text-ink-soft">创建一个事项，开始记账</p>
      </div>
    </div>

    <!-- 新建弹窗 -->
    <div
      v-if="showCreate"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="showCreate = false"
    >
      <div class="gb-card gb-pop w-full max-w-md p-5">
        <h3 class="gb-title-kai mb-4 text-xl font-bold">新建事项</h3>

        <label class="gb-label" for="ev-name">事项名称</label>
        <input id="ev-name" v-model="form.name" class="gb-input" placeholder="如：陈府迎宾宴 / 王府寿宴" @keydown.enter.prevent="submitCreate" />

        <div class="mt-4">
          <span class="gb-label">类型（决定界面与礼簿主题）</span>
          <div class="grid grid-cols-2 gap-2">
            <button
              class="gb-btn gb-btn-ghost flex-col gap-1 py-3"
              :class="form.kind === 'red' ? '!border-primary !bg-primary-soft' : ''"
              @click="form.kind = 'red'"
            >
              <span class="gb-title-kai text-lg font-bold">喜庆红</span>
              <span class="text-xs text-ink-soft">婚宴 · 寿宴 · 满月</span>
            </button>
            <button
              class="gb-btn gb-btn-ghost flex-col gap-1 py-3"
              :class="form.kind === 'white' ? '!border-primary !bg-primary-soft' : ''"
              @click="form.kind = 'white'"
            >
              <span class="gb-title-kai text-lg font-bold">肃穆灰</span>
              <span class="text-xs text-ink-soft">白事 · 追思</span>
            </button>
          </div>
        </div>

        <div class="mt-4">
          <label class="gb-label" for="ev-date">事项日期</label>
          <input id="ev-date" v-model="form.date" type="date" class="gb-input" />
        </div>

        <div class="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label class="gb-label" for="ev-pw">管理密码</label>
            <input id="ev-pw" v-model="form.password" type="password" class="gb-input" placeholder="至少 4 位" />
          </div>
          <div>
            <label class="gb-label" for="ev-pw2">确认密码</label>
            <input id="ev-pw2" v-model="form.password2" type="password" class="gb-input" @keydown.enter.prevent="submitCreate" />
          </div>
        </div>
        <p class="mt-2 text-xs text-ink-soft">
          ⚠ 密码经 PBKDF2 派生密钥加密全部数据，<b>丢失无法找回</b>，请务必牢记。
        </p>

        <div class="mt-5 flex justify-end gap-2">
          <button class="gb-btn gb-btn-ghost" @click="showCreate = false">取消</button>
          <button class="gb-btn gb-btn-primary" :disabled="creating" @click="submitCreate">创建</button>
        </div>
      </div>
    </div>
  </div>
</template>
