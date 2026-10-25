<script setup lang="ts">
/**
 * 秒录记账 —— 全键盘操作流：
 *   姓名 Enter → 金额 Enter → 提交（播报+清空回姓名）
 *   数字键 1-4 快切渠道；重名时 Enter 二次确认强制登记
 */
import { ref, computed } from 'vue'
import type { Channel } from '@/types'
import { CHANNELS } from '@/types'
import { useLedgerStore } from '@/stores/ledger'
import { useUiStore } from '@/stores/ui'
import { toChineseAmount, toSpokenAmount, formatAmount } from '@/lib/amount'
import { speak } from '@/lib/speech'
import MockQR from '@/components/MockQR.vue'

const ledger = useLedgerStore()
const ui = useUiStore()

const name = ref('')
const amount = ref('')
const note = ref('')
const channel = ref<Channel>('wechat')

const nameInput = ref<HTMLInputElement>()
const amountInput = ref<HTMLInputElement>()
const noteInput = ref<HTMLInputElement>()

const amountNum = computed(() => {
  const n = Number(amount.value)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0
})
const upperPreview = computed(() => (amountNum.value > 0 ? toChineseAmount(amountNum.value) : ''))

/** 重名警示（软提示：Enter 二次确认） */
interface PendingSubmit {
  name: string
  amount: number
  channel: Channel
  note: string
  existingName: string
  existingAmountText: string
}
const pending = ref<PendingSubmit | null>(null)

function buildPayload(): PendingSubmit | null {
  const n = name.value.trim()
  if (!n) {
    ui.toast('请输入姓名', 'warn')
    nameInput.value?.focus()
    return null
  }
  if (!amountNum.value) {
    ui.toast('请输入金额', 'warn')
    amountInput.value?.focus()
    return null
  }
  const dup = ledger.findSameName(n)
  return {
    name: n,
    amount: amountNum.value,
    channel: channel.value,
    note: note.value,
    existingName: dup ? dup.name : '',
    existingAmountText: dup ? formatAmount(dup.amount) : '',
  }
}

/** 金额重复提示（不阻断） */
function warnDupAmount(amount: number) {
  const same = ledger.findSameAmount(amount)
  if (same) {
    ui.toast(`提示：${same.name} 也是 ${formatAmount(amount)} 元，请核对`, 'warn')
  }
}

function commit(p: PendingSubmit) {
  ledger.addRecord({ name: p.name, amount: p.amount, channel: p.channel, note: p.note || undefined })
  warnDupAmount(p.amount)
  if (ledger.settings.voiceEnabled) {
    speak(`${p.name}，礼金${toSpokenAmount(p.amount)}`)
  }
  pending.value = null
  name.value = ''
  amount.value = ''
  note.value = ''
  nameInput.value?.focus()
}

function trySubmit() {
  const p = buildPayload()
  if (!p) return
  if (p.existingName && !pending.value) {
    // 第一次 Enter：软提示；再次 Enter / 点「仍然登记」→ 强制提交
    pending.value = p
    return
  }
  commit(p)
}

function onNameEnter() {
  if (!amount.value) {
    amountInput.value?.focus()
  } else {
    trySubmit()
  }
}

function onAmountEnter() {
  if (note.value) {
    noteInput.value?.focus()
  } else {
    trySubmit()
  }
}

/** 收款码：选中微信/支付宝时展示；优先用已上传的真实收款码，否则 mock 占位 */
const qrChannel = computed<'wechat' | 'alipay' | null>(() =>
  channel.value === 'wechat' || channel.value === 'alipay' ? channel.value : null,
)
const qrSrc = computed(() =>
  qrChannel.value === 'wechat' ? ledger.settings.qrWechat : qrChannel.value === 'alipay' ? ledger.settings.qrAlipay : undefined,
)
const qrLabel = computed(() => (channel.value === 'wechat' ? '微信收款' : '支付宝收款'))

/** Esc 关闭重名警示 */
function onEntryKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && pending.value) {
    pending.value = null
  }
}

</script>

<template>
  <div class="gb-card p-4 sm:p-5">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="gb-title-kai text-lg font-bold">快速记账</h2>
      <span class="hidden text-xs text-ink-soft sm:block">姓名 Enter → 金额 Enter → 完成</span>
    </div>

    <div class="grid gap-3 lg:grid-cols-[1fr_auto]">
      <div>
        <div class="grid gap-3 sm:grid-cols-[1.2fr_1fr_auto_auto]">
          <div>
            <label class="gb-label" for="q-name">姓名</label>
            <input
              id="q-name"
              ref="nameInput"
              v-model="name"
              class="gb-input text-base"
              placeholder="宾客姓名"
              autocomplete="off"
              @keydown.enter.prevent="onNameEnter"
              @keydown="onEntryKeydown"
            />
          </div>
          <div>
            <label class="gb-label" for="q-amount">
              金额（元）
              <span v-if="upperPreview" class="ml-1 text-primary"> {{ upperPreview }}</span>
            </label>
            <input
              id="q-amount"
              ref="amountInput"
              v-model="amount"
              class="gb-input text-base font-num"
              inputmode="decimal"
              placeholder="0.00"
              @keydown.enter.prevent="onAmountEnter"
              @keydown="onEntryKeydown"
            />
          </div>
          <div>
            <label class="gb-label" for="q-channel">渠道</label>
            <select id="q-channel" v-model="channel" class="gb-input w-32">
              <option v-for="c in CHANNELS" :key="c.key" :value="c.key">{{ c.label }}</option>
            </select>
          </div>
          <div class="hidden items-end sm:flex">
            <button class="gb-btn gb-btn-primary h-[38px] px-5" @click="trySubmit">
              登记 ⏎
            </button>
          </div>
        </div>

        <div class="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            ref="noteInput"
            v-model="note"
            class="gb-input flex-1 text-sm"
            placeholder="备注（选填，如：张三家 / 李四之子，礼簿 PDF 附录将收录）"
            @keydown.enter.prevent="trySubmit"
            @keydown="onEntryKeydown"
          />
          <button class="gb-btn gb-btn-primary sm:hidden" @click="trySubmit">登记 ⏎</button>
        </div>
      </div>

      <!-- 收款码展示（选中微信/支付宝时） -->
      <div
        v-if="qrChannel"
        class="gb-pop flex flex-col items-center gap-1.5 self-start rounded-lg border border-line bg-surface px-4 py-3"
      >
        <span class="gb-title-kai text-sm font-bold">{{ qrLabel }}</span>
        <div class="h-28 w-28 overflow-hidden rounded-md border border-line bg-white p-1">
          <img v-if="qrSrc" :src="qrSrc" class="h-full w-full object-contain" alt="收款码" />
          <MockQR v-else :seed="qrChannel" />
        </div>
        <span v-if="!qrSrc" class="text-[11px] text-ink-soft">占位码 · 可在归档页上传真实收款码</span>
      </div>
    </div>

    <!-- 重名软提示 -->
    <div
      v-if="pending"
      class="gb-pop mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900"
    >
      <span class="font-bold">⚠ 已有同名记录：{{ pending.existingName }}（{{ pending.existingAmountText }} 元）</span>
      <span class="text-amber-700">按 Enter 仍然登记，Esc 取消</span>
      <div class="flex gap-2">
        <button class="gb-btn gb-btn-primary px-3 py-1 text-xs" @click="commit(pending)">仍然登记</button>
        <button class="gb-btn gb-btn-ghost px-3 py-1 text-xs" @click="pending = null">取消</button>
      </div>
    </div>
  </div>
</template>
