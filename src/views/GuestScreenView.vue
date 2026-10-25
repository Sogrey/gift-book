<script setup lang="ts">
/** 副屏展示页：只接收主屏广播（不持有密钥、不解密数据），适合宴会现场外接大屏 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { GuestBroadcast } from '@/types'
import { bus } from '@/lib/bus'
import { formatClock } from '@/lib/amount'

const route = useRoute()
const eventId = computed(() => String(route.params.id))

const state = ref<GuestBroadcast | null>(null)
const fullscreenHintVisible = ref(true)

let dispose: (() => void) | null = null

onMounted(() => {
  dispose = bus.on<GuestBroadcast>('ledger.update', (msg) => {
    if (msg?.eventId !== eventId.value) return
    state.value = msg
  })
  // 问好：请求主屏立即推送全量快照
  bus.emit('ledger.hello', { eventId: eventId.value })
  setTimeout(() => (fullscreenHintVisible.value = false), 6000)
})

onUnmounted(() => dispose?.())

// 主题跟随事项类型
watch(
  () => state.value?.screen?.kind,
  (kind) => {
    document.documentElement.dataset.theme = kind === 'white' ? 'gray' : 'red'
  },
)

const isReady = computed(() => !!state.value?.event)
const latest = computed(() => state.value?.latest ?? null)
const snapshot = computed(() => state.value?.snapshot)
const screenCfg = computed(() => state.value?.screen)
const isPrivacy = computed(() => !!screenCfg.value?.privacy)

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen()
  } else {
    document.documentElement.requestFullscreen().catch(() => {})
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'F11') {
    e.preventDefault()
    toggleFullscreen()
  }
}
window.addEventListener('keydown', onKeydown, { once: false })
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="flex h-screen w-screen overflow-hidden">
    <!-- 收款码区 -->
    <aside
      v-if="screenCfg?.showQr && (screenCfg.qrWechat || screenCfg.qrAlipay)"
      class="flex w-1/4 shrink-0 flex-col items-center gap-6 border-r-2 border-line bg-white px-6 py-10"
    >
      <div v-if="screenCfg.qrWechat" class="flex flex-col items-center gap-2">
        <img :src="screenCfg.qrWechat" class="max-h-64 w-auto max-w-full rounded-lg border-4 border-line" alt="微信收款码" />
        <span class="gb-title-kai text-2xl font-bold">微信收款</span>
      </div>
      <div v-if="screenCfg.qrAlipay" class="flex flex-col items-center gap-2">
        <img :src="screenCfg.qrAlipay" class="max-h-64 w-auto max-w-full rounded-lg border-4 border-line" alt="支付宝收款码" />
        <span class="gb-title-kai text-2xl font-bold">支付宝收款</span>
      </div>
      <p
        v-if="screenCfg.notice"
        class="gb-title-kai mt-auto text-center text-xl font-bold leading-relaxed text-primary"
      >
        {{ screenCfg.notice }}
      </p>
    </aside>

    <!-- 主展示区 -->
    <main class="relative flex flex-1 flex-col overflow-hidden">
      <!-- 等待连接 -->
      <div v-if="!isReady" class="flex h-full flex-col items-center justify-center gap-6">
        <div class="gb-title-kai text-7xl tracking-[0.3em] text-primary opacity-80">礼 簿</div>
        <p class="text-lg text-ink-soft">正在等待主屏推送数据…</p>
        <p class="max-w-md text-center text-sm leading-relaxed text-ink-soft">
          请在记账端打开同一事项并解锁，副屏将实时接收礼簿动态。<br />
          本页面不存储任何数据，关闭即清空。
        </p>
      </div>

      <template v-else>
        <!-- 标题栏 -->
        <div class="shrink-0 border-b border-line/70 bg-surface/60 px-8 pt-6 pb-3 text-center">
          <h1 class="gb-title-kai text-4xl font-bold tracking-[0.35em] text-primary">
            {{ state!.event!.name }}
          </h1>
          <div class="mt-2 flex items-center justify-center gap-4 text-sm text-ink-soft">
            <span>累计 {{ snapshot!.totalCount }} 笔</span>
            <span class="font-num font-semibold text-ink">合计 {{ snapshot!.totalAmountText }}</span>
            <span v-if="isPrivacy" class="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
              隐私模式
            </span>
          </div>
        </div>

        <!-- 最新一笔大字 -->
        <div v-if="latest" class="flex flex-1 items-center justify-center overflow-hidden px-8">
          <div :key="latest.index" class="gb-flash flex flex-col items-center">
            <div class="gb-title-kai text-8xl font-bold leading-tight text-primary">{{ latest.name }}</div>
            <div class="mt-4 flex items-baseline gap-3">
              <span class="text-xl text-ink-soft">礼金</span>
              <span class="font-num text-6xl font-bold text-primary-deep">{{ latest.amountText }}</span>
              <span class="text-xl text-ink-soft">元</span>
            </div>
            <div class="mt-3 text-sm text-ink-soft">{{ formatClock(latest.time) }}</div>
          </div>
        </div>
        <div v-else class="flex flex-1 items-center justify-center text-2xl text-ink-soft">虚位以待 · 恭候嘉宾</div>

        <!-- 滚动列表 -->
        <div class="h-[38%] shrink-0 overflow-hidden border-t-2 border-line/70 bg-surface/40 px-8 py-4">
          <div class="flex flex-col gap-1.5">
            <div
              v-for="(r, i) in snapshot!.records.slice(0, 12)"
              :key="latest!.index - i + '-' + r.time"
              class="flex items-center gap-4 rounded-lg px-4 py-2"
              :class="i === 0 ? 'gb-pop bg-primary-soft' : ''"
            >
              <span class="gb-title-kai w-36 truncate text-2xl font-bold">{{ r.name }}</span>
              <span class="font-num ml-auto text-2xl font-semibold">{{ r.amountText }}</span>
              <span class="w-16 text-right text-sm text-ink-soft">{{ formatClock(r.time) }}</span>
            </div>
          </div>
        </div>
      </template>

      <!-- 全屏按钮 + 提示 -->
      <button
        class="fixed right-4 top-4 z-50 rounded-lg bg-white/80 px-3 py-2 text-lg text-ink-soft shadow hover:text-primary"
        title="全屏 / 退出全屏（F11）"
        @click="toggleFullscreen"
      >
        ⛶
      </button>
      <Transition name="hint">
        <div
          v-if="fullscreenHintVisible"
          class="fixed left-1/2 top-4 z-40 -translate-x-1/2 rounded-full bg-black/60 px-4 py-1.5 text-sm text-white"
        >
          按 F11 进入全屏以获得最佳效果
        </div>
      </Transition>
    </main>
  </div>
</template>

<style scoped>
.hint-enter-active,
.hint-leave-active {
  transition: opacity 0.6s;
}
.hint-enter-from,
.hint-leave-to {
  opacity: 0;
}
</style>
