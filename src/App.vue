<script setup lang="ts">
import { watchEffect } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useLedgerStore } from '@/stores/ledger'

const ui = useUiStore()
const ledger = useLedgerStore()

// 主题应用：优先跟随当前事项（红事/白事），无事项时用全局偏好
watchEffect(() => {
  const kind = ledger.meta?.kind ?? ui.theme
  document.documentElement.dataset.theme = kind === 'white' ? 'gray' : 'red'
})
</script>

<template>
  <router-view />

  <!-- Toast 容器 -->
  <div class="pointer-events-none fixed inset-x-0 top-4 z-[90] flex flex-col items-center gap-2 px-4">
    <TransitionGroup name="toast">
      <div
        v-for="t in ui.toasts"
        :key="t.id"
        class="pointer-events-auto gb-pop max-w-md rounded-lg px-4 py-2.5 text-sm shadow-lg border"
        :class="{
          'bg-white border-line text-ink': t.tone === 'info',
          'bg-primary text-white border-transparent': t.tone === 'success',
          'bg-amber-50 border-amber-300 text-amber-900': t.tone === 'warn',
          'bg-red-600 text-white border-transparent': t.tone === 'error',
        }"
      >
        {{ t.text }}
      </div>
    </TransitionGroup>
  </div>

  <!-- 全局确认对话 -->
  <div
    v-if="ui.confirmState"
    class="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 p-4"
    @click.self="ui.resolveConfirm(false)"
  >
    <div class="gb-card gb-pop w-full max-w-sm p-5">
      <h3 class="gb-title-kai text-lg font-bold">{{ ui.confirmState.title }}</h3>
      <p v-if="ui.confirmState.message" class="mt-2 text-sm text-ink-soft whitespace-pre-line">
        {{ ui.confirmState.message }}
      </p>
      <div class="mt-5 flex justify-end gap-2">
        <button class="gb-btn gb-btn-ghost" @click="ui.resolveConfirm(false)">取消</button>
        <button
          class="gb-btn"
          :class="ui.confirmState.danger ? 'gb-btn-danger' : 'gb-btn-primary'"
          @click="ui.resolveConfirm(true)"
        >
          {{ ui.confirmState.confirmText ?? '确定' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
