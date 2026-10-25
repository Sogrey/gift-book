<script setup lang="ts">
/** 礼簿记录列表：搜索、编辑、作废、删除 */
import { ref, computed } from 'vue'
import type { LedgerRecord } from '@/types'
import { CHANNELS } from '@/types'
import { useLedgerStore } from '@/stores/ledger'
import { useUiStore } from '@/stores/ui'
import { formatAmount, formatTime, toChineseAmount } from '@/lib/amount'

const ledger = useLedgerStore()
const ui = useUiStore()

const keyword = ref('')
const onlyValid = ref(true)
const editingId = ref<string | null>(null)
const editForm = ref({ name: '', amount: 0, channel: 'wechat' as LedgerRecord['channel'], note: '' })

const filtered = computed(() => {
  let list = [...ledger.records].sort((a, b) => b.createdAt - a.createdAt)
  if (onlyValid.value) list = list.filter((r) => !r.voided)
  const kw = keyword.value.trim().toLowerCase()
  if (kw) list = list.filter((r) => r.name.toLowerCase().includes(kw) || (r.note ?? '').toLowerCase().includes(kw))
  return list
})

function startEdit(r: LedgerRecord) {
  editingId.value = r.id
  editForm.value = { name: r.name, amount: r.amount, channel: r.channel, note: r.note ?? '' }
}

function saveEdit() {
  if (!editingId.value) return
  const amount = Math.round(Number(editForm.value.amount) * 100) / 100
  if (!editForm.value.name.trim() || !Number.isFinite(amount) || amount <= 0) {
    ui.toast('姓名或金额不合法', 'warn')
    return
  }
  ledger.updateRecord(editingId.value, {
    name: editForm.value.name.trim(),
    amount,
    channel: editForm.value.channel,
    note: editForm.value.note.trim() || undefined,
  })
  editingId.value = null
  ui.toast('已修改', 'success')
}

async function onDelete(r: LedgerRecord) {
  const ok = await ui.confirm({
    title: '删除记录？',
    message: `将彻底删除「${r.name} · ￥${formatAmount(r.amount)}」。\n建议优先使用「作废」保留痕迹。`,
    confirmText: '删除',
    danger: true,
  })
  if (ok) {
    ledger.removeRecord(r.id)
    ui.toast('已删除', 'success')
  }
}

function onVoid(r: LedgerRecord) {
  ledger.toggleVoid(r.id)
  ui.toast(r.voided ? '已恢复' : '已作废（不计入统计）', 'success')
}

const channelLabel = (key: string) => CHANNELS.find((c) => c.key === key)?.label ?? key
</script>

<template>
  <div class="gb-card overflow-hidden">
    <div class="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
      <h2 class="gb-title-kai text-lg font-bold">礼簿</h2>
      <input
        v-model="keyword"
        class="gb-input ml-auto w-44 text-sm"
        placeholder="搜索姓名 / 备注"
      />
      <label class="flex cursor-pointer select-none items-center gap-1.5 text-sm text-ink-soft">
        <input v-model="onlyValid" type="checkbox" class="accent-primary" />
        只看有效
      </label>
      <span class="text-xs text-ink-soft">共 {{ filtered.length }} 条</span>
    </div>

    <div class="max-h-[58vh] overflow-auto">
      <table class="w-full text-sm">
        <thead class="sticky top-0 bg-surface text-xs text-ink-soft">
          <tr>
            <th class="px-4 py-2 text-left font-medium">姓名</th>
            <th class="px-3 py-2 text-right font-medium">礼金</th>
            <th class="px-3 py-2 text-left font-medium">大写</th>
            <th class="px-3 py-2 text-left font-medium">渠道</th>
            <th class="px-3 py-2 text-left font-medium">备注</th>
            <th class="px-3 py-2 text-left font-medium">时间</th>
            <th class="px-3 py-2 text-right font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in filtered"
            :key="r.id"
            class="border-t border-line/60 transition-colors hover:bg-surface"
            :class="r.voided ? 'opacity-45' : ''"
          >
            <template v-if="editingId === r.id">
              <td class="px-4 py-1.5"><input v-model="editForm.name" class="gb-input py-1 text-sm" /></td>
              <td class="px-3 py-1.5"><input v-model.number="editForm.amount" class="gb-input py-1 text-right text-sm" /></td>
              <td class="px-3 py-1.5 text-xs text-ink-soft">{{ toChineseAmount(editForm.amount) }}</td>
              <td class="px-3 py-1.5">
                <select v-model="editForm.channel" class="gb-input py-1 text-xs">
                  <option v-for="c in CHANNELS" :key="c.key" :value="c.key">{{ c.label }}</option>
                </select>
              </td>
              <td class="px-3 py-1.5"><input v-model="editForm.note" class="gb-input py-1 text-xs" /></td>
              <td class="px-3 py-1.5 text-xs text-ink-soft">{{ formatTime(r.createdAt) }}</td>
              <td class="px-3 py-1.5 text-right">
                <button class="gb-btn gb-btn-primary px-2 py-1 text-xs" @click="saveEdit">保存</button>
                <button class="gb-btn gb-btn-ghost ml-1 px-2 py-1 text-xs" @click="editingId = null">取消</button>
              </td>
            </template>
            <template v-else>
              <td class="gb-title-kai px-4 py-2.5 font-bold">{{ r.name }}</td>
              <td class="font-num px-3 py-2.5 text-right font-semibold">￥{{ formatAmount(r.amount) }}</td>
              <td class="px-3 py-2.5 text-xs text-ink-soft">{{ toChineseAmount(r.amount) }}</td>
              <td class="px-3 py-2.5">
                <span class="rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary-deep">
                  {{ channelLabel(r.channel) }}
                </span>
              </td>
              <td class="px-3 py-2.5 text-xs text-ink-soft">{{ r.note || '—' }}</td>
              <td class="px-3 py-2.5 text-xs text-ink-soft">{{ formatTime(r.createdAt) }}</td>
              <td class="px-3 py-2.5 text-right whitespace-nowrap">
                <button class="gb-btn gb-btn-ghost px-2 py-1 text-xs" @click="startEdit(r)">编辑</button>
                <button class="gb-btn gb-btn-ghost px-2 py-1 text-xs" @click="onVoid(r)">
                  {{ r.voided ? '恢复' : '作废' }}
                </button>
                <button class="gb-btn gb-btn-danger px-2 py-1 text-xs" @click="onDelete(r)">删除</button>
              </td>
            </template>
          </tr>
          <tr v-if="!filtered.length">
            <td colspan="7" class="px-4 py-12 text-center text-sm text-ink-soft">
              暂无记录，先在上方录入第一笔礼金吧
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
