/** UI store：toast 提示 + 全局确认对话（Promise 化） */
import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface ToastItem {
  id: number
  text: string
  tone: 'success' | 'warn' | 'error' | 'info'
}

interface ConfirmRequest {
  id: number
  title: string
  message?: string
  confirmText?: string
  danger?: boolean
  resolve: (ok: boolean) => void
}

let toastSeq = 1
let confirmSeq = 1

export const useUiStore = defineStore('ui', () => {
  const toasts = ref<ToastItem[]>([])
  const confirmState = ref<ConfirmRequest | null>(null)
  const theme = ref<'red' | 'gray'>((localStorage.getItem('gb:theme') as 'red' | 'gray') || 'red')

  function setTheme(t: 'red' | 'gray') {
    theme.value = t
    localStorage.setItem('gb:theme', t)
  }

  function toast(text: string, tone: ToastItem['tone'] = 'info', duration = 2600) {
    const id = toastSeq++
    toasts.value.push({ id, text, tone })
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id)
    }, duration)
  }

  function confirm(input: {
    title: string
    message?: string
    confirmText?: string
    danger?: boolean
  }): Promise<boolean> {
    return new Promise((resolve) => {
      confirmState.value = { id: confirmSeq++, resolve, ...input }
    })
  }

  function resolveConfirm(ok: boolean) {
    confirmState.value?.resolve(ok)
    confirmState.value = null
  }

  return { toasts, toast, confirm, confirmState, resolveConfirm, theme, setTheme }
})
