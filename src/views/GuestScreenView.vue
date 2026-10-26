<script setup lang="ts">
/** 副屏展示页：仿古竖排礼簿格 —— 只接收主屏广播（不持有密钥、不解密数据），
 *  适合宴会现场外接大屏：每笔礼金一格，姓名/贺礼/大写金额竖排，新格自动滚动跟随。 */
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import type { GuestBroadcast } from '@/types'
import { bus } from '@/lib/bus'
import { formatClock } from '@/lib/amount'

const route = useRoute()
const eventId = computed(() => String(route.params.id))

const state = ref<GuestBroadcast | null>(null)
const fullscreenHintVisible = ref(true)
const bookEl = ref<HTMLElement | null>(null)
const trackEl = ref<HTMLElement | null>(null)

let dispose: (() => void) | null = null

onMounted(() => {
  dispose = bus.on<GuestBroadcast>('ledger.update', (msg) => {
    if (msg?.eventId !== eventId.value) return
    state.value = msg
  })
  bus.emit('ledger.hello', { eventId: eventId.value })
  setTimeout(() => (fullscreenHintVisible.value = false), 6000)
  startCarousel()
})

onUnmounted(() => {
  dispose?.()
  stopCarousel()
})

// 主题跟随事项类型
watch(
  () => state.value?.screen?.kind,
  (kind) => {
    document.documentElement.dataset.theme = kind === 'white' ? 'gray' : 'red'
  },
)

const isReady = computed(() => !!state.value?.event)
const snapshot = computed(() => state.value?.snapshot)
const screenCfg = computed(() => state.value?.screen)
const isPrivacy = computed(() => !!screenCfg.value?.privacy)

/** 时间顺序（旧→新），最新在右；双份渲染实现无缝循环 */
const loopRecords = computed(() => [...(snapshot.value?.records ?? [])].reverse())
const latestTime = computed(() => snapshot.value?.records?.[0]?.time ?? 0)

/** 传统礼簿习惯：两字姓名中间加全角空格 */
function displayName(name: string): string {
  return name.length === 2 ? `${name[0]}\u3000${name[1]}` : name
}

// 新格子出现 → 柔和滚动到最新一格居中（260px/s），停留 4s 后恢复单向轮播
watch(
  () => latestTime.value,
  async () => {
    await nextTick()
    const frame = bookEl.value
    const latest = frame?.querySelector<HTMLElement>('[data-loop="a"] [data-latest="true"]')
    if (!frame || !latest) return
    const W = loopWidth()
    const target = Math.max(0, Math.min(W - 1, latest.offsetLeft + latest.offsetWidth / 2 - frame.clientWidth / 2))
    if (Math.abs(target - carousel.basePos) < 8) {
      carousel.holdUntil = performance.now() + 4000 // 已在视野内，仅停留展示
    } else {
      carousel.softTarget = target
    }
  },
)

/* ============ 单向无缝循环轮播（transform 位移驱动） ============
 *  内容渲染两份（a/b 拼接），滚过一份宽度即回卷 —— 视觉无缝、方向恒定（从右往左流动）。
 *  位移用 transform 而非 scrollLeft：亚像素浮点平滑，彻底消除整数像素步进的忽快忽慢；
 *  时间驱动：位置 = 基点 + 经过时间 × 速度，帧率波动不影响速度。
 */
const carousel = {
  speed: 48, // 常速 px/s（一格约 4 秒）
  softSpeed: 260, // 新礼金定位滚动 px/s
  basePos: 0,
  baseTs: 0,
  softTarget: null as number | null,
  holdUntil: 0,
  rafId: 0,
}

/** 一份循环内容的宽度（px） */
function loopWidth(): number {
  const track = trackEl.value
  const a = track?.querySelector<HTMLElement>('[data-loop="a"]')
  if (!track || !a) return 0
  return a.offsetLeft + a.offsetWidth
}

function syncBase(pos: number) {
  carousel.basePos = pos
  carousel.baseTs = performance.now()
}

/** 应用位移（浮点，不经 scrollLeft 整数化） */
function applyPos(p: number) {
  if (trackEl.value) trackEl.value.style.transform = `translate3d(${-p}px,0,0)`
}

function carouselTick() {
  carousel.rafId = requestAnimationFrame(carouselTick)
  const frame = bookEl.value
  const track = trackEl.value
  if (!frame || !track) return
  const W = loopWidth()
  if (!W || W <= frame.clientWidth + 4) {
    applyPos(0) // 内容不满一屏：静停展示全部
    return
  }
  const now = performance.now()
  if (document.hidden) return // 页签不可见：暂停推进（基点保留，回来续播）

  // 阶段一：柔和滚向新礼金
  if (carousel.softTarget !== null) {
    const elapsed = (now - carousel.baseTs) / 1000
    const dist = carousel.softTarget - carousel.basePos
    let p = carousel.basePos + Math.sign(dist) * carousel.softSpeed * elapsed
    if (Math.sign(carousel.softTarget - p) !== Math.sign(dist)) {
      p = carousel.softTarget
      carousel.softTarget = null
      carousel.holdUntil = now + 4000 // 到达后停留 4s 展示最新礼金
    }
    syncBase(p)
    applyPos(p)
    return
  }

  // 阶段二：新礼金停留期（每帧重置基点时间，避免恢复时按累计时间突跳）
  if (now < carousel.holdUntil) {
    syncBase(carousel.basePos)
    return
  }

  // 阶段三：常速单向循环
  let pos = carousel.basePos + ((now - carousel.baseTs) / 1000) * carousel.speed
  while (pos >= W) pos -= W // 无缝回卷
  syncBase(pos)
  applyPos(pos)
}

function startCarousel() {
  syncBase(0)
  carousel.rafId = requestAnimationFrame(carouselTick)
}

function stopCarousel() {
  cancelAnimationFrame(carousel.rafId)
}

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
window.addEventListener('keydown', onKeydown)
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
        <div class="shrink-0 border-b-2 border-line/70 bg-surface/60 px-8 pt-4 pb-2 text-center">
          <div class="flex items-baseline justify-center gap-5">
            <h1 class="gb-title-kai text-3xl font-bold tracking-[0.35em] text-primary">
              {{ state!.event!.name }}
            </h1>
            <span class="text-sm text-ink-soft">
              累计 <b class="font-num text-ink">{{ snapshot!.totalCount }}</b> 笔
            </span>
            <span class="font-num text-sm font-semibold text-ink">合计 {{ snapshot!.totalAmountText }}</span>
            <span v-if="isPrivacy" class="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
              隐私模式
            </span>
          </div>
        </div>

        <!-- 仿古竖排礼簿格（内容渲染两份实现无缝循环轮播，transform 位移驱动） -->
        <div v-if="loopRecords.length" class="book-wrap flex-1 px-6 py-5">
          <div ref="bookEl" class="book-frame">
            <div ref="trackEl" class="book-track">
              <div class="book-loop" data-loop="a">
                <div
                  v-for="(r, i) in loopRecords"
                  :key="'a' + latestTime + '-' + r.time + '-' + i"
                  class="book-cell"
                  :class="r.time === latestTime ? 'book-cell-latest' : ''"
                  :data-latest="r.time === latestTime"
                >
                  <div class="cell-name gb-vertical gb-title-kai">{{ displayName(r.name) }}</div>
                  <div class="cell-divider" />
                  <div class="cell-label gb-vertical gb-title-kai">贺礼</div>
                  <div class="cell-divider" />
                  <div class="cell-amount gb-vertical">{{ r.upper }}</div>
                  <div class="cell-num font-num">
                    {{ r.amountText === '***' ? '***' : '￥' + r.amountText }}
                    <span class="cell-clock">{{ formatClock(r.time) }}</span>
                  </div>
                </div>
              </div>
              <div class="book-loop" data-loop="b" aria-hidden="true">
                <div
                  v-for="(r, i) in loopRecords"
                  :key="'b' + latestTime + '-' + r.time + '-' + i"
                  class="book-cell"
                  :class="r.time === latestTime ? 'book-cell-latest' : ''"
                >
                  <div class="cell-name gb-vertical gb-title-kai">{{ displayName(r.name) }}</div>
                  <div class="cell-divider" />
                  <div class="cell-label gb-vertical gb-title-kai">贺礼</div>
                  <div class="cell-divider" />
                  <div class="cell-amount gb-vertical">{{ r.upper }}</div>
                  <div class="cell-num font-num">
                    {{ r.amountText === '***' ? '***' : '￥' + r.amountText }}
                    <span class="cell-clock">{{ formatClock(r.time) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <!-- 空礼簿占位 -->
        <div v-else class="flex flex-1 items-center justify-center">
          <span class="gb-title-kai text-3xl tracking-[0.5em] text-ink-soft opacity-60">虚位以待 · 恭候嘉宾</span>
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
/* ============ 仿古礼簿竖格（transform 位移轮播） ============ */
.book-wrap {
  min-height: 0;
}
.book-frame {
  position: relative;
  height: 100%;
  overflow: hidden;
  border: 3px solid var(--gb-primary);
  outline: 1px solid var(--gb-primary);
  outline-offset: 3px;
  background: #fff;
}
.book-track {
  display: flex;
  position: relative; /* cells 的 offsetParent，offsetLeft 不受位移影响 */
  height: 100%;
  width: max-content;
  will-change: transform;
}
.book-loop {
  display: flex;
  flex: 0 0 auto;
  height: 100%;
}

.book-cell {
  position: relative;
  flex: 0 0 auto;
  width: clamp(120px, 11vw, 190px);
  display: flex;
  flex-direction: column;
  padding: 14px 0 0;
  border-right: 1px solid var(--gb-border);
}
/* 循环拼接处首尾相遇也保留分界线（不设 last-child 例外） */
.book-cell-latest {
  background: var(--gb-surface);
  animation: gb-flash 0.7s ease-out both;
}

.cell-name {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(30px, 5.4vh, 58px);
  font-weight: 700;
  color: var(--gb-ink);
  letter-spacing: 0.18em;
  min-height: 0;
  overflow: hidden;
  padding: 0 6px;
  text-align: center;
}

.cell-divider {
  height: 2px;
  background: var(--gb-primary);
  opacity: 0.85;
  margin: 0 8px;
}

.cell-label {
  flex: 0 0 auto;
  height: clamp(52px, 12vh, 88px);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(16px, 2.6vh, 26px);
  font-weight: 700;
  color: var(--gb-primary);
  letter-spacing: 0.35em;
}

.cell-amount {
  flex: 0 0 auto;
  height: 34%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(14px, 2.2vh, 22px);
  color: var(--gb-ink);
  letter-spacing: 0.22em;
  overflow: hidden;
  padding: 0 6px;
  text-align: center;
}

.cell-num {
  flex: 0 0 auto;
  height: clamp(40px, 8vh, 56px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-top: 1px solid var(--gb-border);
  font-size: clamp(15px, 1.9vh, 20px);
  font-weight: 600;
  color: var(--gb-ink);
}
.cell-clock {
  font-size: 11px;
  font-weight: 400;
  color: var(--gb-ink-soft);
  margin-top: 1px;
}

.hint-enter-active,
.hint-leave-active {
  transition: opacity 0.6s;
}
.hint-enter-from,
.hint-leave-to {
  opacity: 0;
}
</style>
