<script setup lang="ts">
/** 事项工作台：密码解锁 → 记账 / 礼簿 / 统计 / 归档 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useEventsStore } from '@/stores/events'
import { useLedgerStore } from '@/stores/ledger'
import { useUiStore } from '@/stores/ui'
import QuickEntry from '@/components/QuickEntry.vue'
import LedgerTable from '@/components/LedgerTable.vue'
import StatsPanel from '@/components/StatsPanel.vue'
import ArchivePanel from '@/components/ArchivePanel.vue'
import { formatAmount, formatClock } from '@/lib/amount'

const route = useRoute()
const router = useRouter()
const events = useEventsStore()
const ledger = useLedgerStore()
const ui = useUiStore()

const eventId = computed(() => String(route.params.id))
const meta = computed(() => events.getEvent(eventId.value))
const tab = ref<'entry' | 'book' | 'stats' | 'archive'>('entry')

const password = ref('')
const unlockError = ref('')

let disposers: (() => void)[] = []

onMounted(() => {
  if (!meta.value) return
  if (ledger.tryResume(meta.value)) return
  disposers.push(ledger.bindCrossTabSync(meta.value))
  disposers.push(ledger.bindGuestHello())
})

onUnmounted(() => {
  disposers.forEach((d) => d())
  disposers = []
  // 注意：路由离开不锁定（sessionStorage 会话密钥仍在，返回即恢复）；
  // 主动锁定由顶栏「锁定」按钮调用 ledger.lock() 执行。
})

watch(
  () => ledger.unlocked,
  (ok) => {
    if (ok) {
      // 事项类型驱动主题
      ui.setTheme(meta.value?.kind === 'white' ? 'gray' : 'red')
      password.value = ''
      unlockError.value = ''
    }
  },
)

function tryUnlock() {
  if (!meta.value) return
  if (!password.value) return
  if (ledger.unlock(meta.value, password.value)) {
    disposers.push(ledger.bindCrossTabSync(meta.value))
    disposers.push(ledger.bindGuestHello())
  } else {
    unlockError.value = '密码不正确'
  }
}

function lockNow() {
  ledger.lock()
  ui.toast('已锁定', 'info')
}

function openGuestScreen() {
  const url = `${location.origin}${location.pathname}#/guest/${eventId.value}`
  window.open(url, '_blank', 'width=1280,height=800')
  ui.toast('副屏已打开，投射到外接屏幕后按 F11 全屏', 'info', 4200)
}

const recentRecords = computed(() =>
  [...ledger.validRecords].slice(-6).reverse(),
)

const kindText = computed(() => (meta.value?.kind === 'white' ? '白事' : '红事'))
</script>

<template>
  <!-- 事项不存在 -->
  <div v-if="!meta" class="flex min-h-screen flex-col items-center justify-center gap-3">
    <p class="text-ink-soft">事项不存在或已被删除</p>
    <button class="gb-btn gb-btn-primary" @click="router.push('/')">返回首页</button>
  </div>

  <!-- 解锁挡板 -->
  <div v-else-if="!ledger.unlocked" class="flex min-h-screen items-center justify-center px-4">
    <div class="gb-card gb-pop w-full max-w-sm p-6 text-center">
      <div
        class="gb-title-kai mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-2xl text-5xl font-bold"
        :class="meta.kind === 'white' ? 'bg-primary-soft text-primary' : 'bg-primary text-white'"
      >
        礼
      </div>
      <h1 class="gb-title-kai text-2xl font-bold">{{ meta.name }}</h1>
      <p class="mt-1 text-xs text-ink-soft">{{ kindText }} · {{ meta.date ?? '' }}</p>
      <p class="mt-4 text-sm text-ink-soft">数据已加密，请输入管理密码解锁</p>
      <input
        v-model="password"
        type="password"
        class="gb-input mt-2 text-center"
        placeholder="管理密码"
        @keydown.enter.prevent="tryUnlock"
      />
      <p v-if="unlockError" class="mt-1 text-sm text-red-600">{{ unlockError }}</p>
      <button class="gb-btn gb-btn-primary mt-3 w-full" @click="tryUnlock">解锁</button>
      <button class="gb-btn gb-btn-ghost mt-2 w-full" @click="router.push('/')">← 返回</button>
    </div>
  </div>

  <!-- 工作台 -->
  <div v-else class="min-h-screen">
    <header class="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2.5">
        <button class="gb-btn gb-btn-ghost px-2.5" title="返回首页" @click="router.push('/')">←</button>
        <h1 class="gb-title-kai text-xl font-bold">{{ meta.name }}</h1>
        <span
          class="rounded-full px-2 py-0.5 text-[11px]"
          :class="meta.kind === 'white' ? 'bg-primary-soft text-primary-deep' : 'bg-primary text-white'"
        >
          {{ kindText }}
        </span>
        <span class="font-num ml-2 hidden text-sm text-ink-soft sm:block">
          ￥{{ formatAmount(ledger.totalAmount) }} · {{ ledger.totalCount }} 笔
        </span>

        <div class="ml-auto flex items-center gap-2">
          <button class="gb-btn gb-btn-primary px-3" @click="openGuestScreen">投屏 ⌗</button>
          <button class="gb-btn gb-btn-ghost px-3" @click="lockNow">锁定</button>
        </div>

        <nav class="flex w-full gap-1 sm:w-auto">
          <button
            v-for="t in ([['entry', '记账'], ['book', '礼簿'], ['stats', '统计'], ['archive', '归档']] as const)"
            :key="t[0]"
            class="gb-btn flex-1 px-4"
            :class="tab === t[0] ? 'gb-btn-primary' : 'gb-btn-ghost'"
            @click="tab = t[0]"
          >
            {{ t[1] }}
          </button>
        </nav>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-4 py-5">
      <!-- 记账 -->
      <div v-if="tab === 'entry'" class="grid gap-4">
        <QuickEntry />

        <div class="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div class="gb-card p-4">
            <div class="mb-2 flex items-center justify-between">
              <h3 class="gb-title-kai font-bold">最新登记</h3>
              <button class="text-xs text-primary hover:underline" @click="tab = 'book'">查看全部 →</button>
            </div>
            <div v-if="recentRecords.length" class="flex flex-col divide-y divide-line/60">
              <div v-for="r in recentRecords" :key="r.id" class="flex items-center gap-3 py-2.5">
                <span class="gb-title-kai w-28 truncate font-bold">{{ r.name }}</span>
                <span class="font-num text-right font-semibold">￥{{ formatAmount(r.amount) }}</span>
                <span class="ml-auto text-xs text-ink-soft">{{ formatClock(r.createdAt) }}</span>
              </div>
            </div>
            <div v-else class="py-10 text-center text-sm text-ink-soft">今日第一笔，等你录入</div>
          </div>

          <div class="gb-card flex flex-col justify-center gap-2 p-4 text-center">
            <div class="text-xs text-ink-soft">今日登记</div>
            <div class="font-num text-4xl font-bold text-primary">{{ ledger.todayCount }}</div>
            <div class="text-xs text-ink-soft">有效合计</div>
            <div class="font-num text-2xl font-bold">￥{{ formatAmount(ledger.totalAmount) }}</div>
            <div class="text-xs text-ink-soft">共 {{ ledger.totalCount }} 笔</div>
          </div>
        </div>
      </div>

      <!-- 礼簿 -->
      <LedgerTable v-else-if="tab === 'book'" />

      <!-- 统计 -->
      <StatsPanel v-else-if="tab === 'stats'" />

      <!-- 归档 -->
      <ArchivePanel v-else />
    </main>
  </div>
</template>
