<script setup lang="ts">
/** 归档与设置：Excel 导出 / PDF 礼簿 / 加密备份 / 副屏与语音设置 */
import { ref } from 'vue'
import { useLedgerStore } from '@/stores/ledger'
import { useEventsStore } from '@/stores/events'
import { useUiStore } from '@/stores/ui'
import { fileToCompressedDataUrl } from '@/lib/image'
import { formatAmount } from '@/lib/amount'
import type { BackupFile } from '@/types'
import { keyFromHex, decryptWithKey, encryptWithKey } from '@/lib/crypto'

const ledger = useLedgerStore()
const events = useEventsStore()
const ui = useUiStore()

const busy = ref('')

/* ---------- Excel ---------- */
async function doExportExcel() {
  if (!ledger.validRecords.length) return ui.toast('暂无有效记录', 'warn')
  const { exportExcel } = await import('@/lib/excel')
  exportExcel(ledger.meta!.name, ledger.records, ledger.meta!.date)
  ui.toast('Excel 已导出', 'success')
}

/* ---------- PDF ---------- */
const recorder = ref(ledger.settings.recorder ?? '')
const coverDataUrl = ref(ledger.settings.coverImage ?? '')
const coverInput = ref<HTMLInputElement>()
const genProgress = ref('')

async function onCoverChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    coverDataUrl.value = await fileToCompressedDataUrl(file, 1600, 0.85)
    ui.toast('封面已就绪', 'success')
  } catch {
    ui.toast('封面图读取失败', 'error')
  } finally {
    coverInput.value!.value = ''
  }
}

async function doGeneratePdf() {
  if (!ledger.validRecords.length) return ui.toast('暂无有效记录', 'warn')
  busy.value = 'pdf'
  genProgress.value = '正在加载中文字体…'
  try {
    ledger.updateSettings({ recorder: recorder.value.trim() || undefined, coverImage: coverDataUrl.value || undefined })
    const { generateGiftPdf } = await import('@/lib/pdf')
    const bytes = await generateGiftPdf(
      ledger.records,
      {
        title: '礼金簿',
        subtitle: `${ledger.meta!.name}${ledger.meta!.date ? ' · ' + ledger.meta!.date : ''}`,
        kind: ledger.meta!.kind,
        recorder: recorder.value.trim() || undefined,
        coverImage: coverDataUrl.value || undefined,
      },
      ledger.toChineseAmount,
    )
    genProgress.value = '生成完成，正在下载…'
    const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `礼金簿_${ledger.meta!.name}.pdf`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    ui.toast('PDF 礼簿已生成', 'success')
  } catch (err) {
    console.error(err)
    ui.toast('PDF 生成失败：' + (err as Error).message, 'error', 5000)
  } finally {
    busy.value = ''
    genProgress.value = ''
  }
}

/* ---------- 加密备份 ---------- */
function doExportBackup() {
  if (!ledger.keyHex || !ledger.meta) return
  busy.value = 'backup'
  try {
    const payload = localStorage.getItem(`gb:data:${ledger.meta.id}`)
    if (!payload) return ui.toast('暂无数据可备份', 'warn')
    const backup: BackupFile = {
      app: 'gift-book-vue',
      version: 1,
      exportedAt: Date.now(),
      meta: {
        name: ledger.meta.name,
        kind: ledger.meta.kind,
        createdAt: ledger.meta.createdAt,
        date: ledger.meta.date,
        salt: ledger.meta.salt,
        verifier: ledger.meta.verifier,
      },
      payload,
    }
    const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `备份_${ledger.meta.name}_${new Date().toISOString().slice(0, 10)}.giftbook.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    ui.toast('加密备份已导出，请妥善保管', 'success')
  } finally {
    busy.value = ''
  }
}

/** 换密码（重派生 + 全量重加密） */
const showRekey = ref(false)
const rekeyForm = ref({ oldPw: '', newPw: '', newPw2: '' })

async function doRekey() {
  if (!ledger.meta || !ledger.keyHex) return
  const f = rekeyForm.value
  if (f.newPw.length < 4) return ui.toast('新密码至少 4 位', 'warn')
  if (f.newPw !== f.newPw2) return ui.toast('两次新密码不一致', 'warn')
  // 校验旧密码
  const { deriveKey, verifyPassword, keyToHex } = await import('@/lib/crypto')
  const dk = deriveKey(f.oldPw, ledger.meta.salt)
  if (!verifyPassword(dk, ledger.meta.verifier)) return ui.toast('原密码不正确', 'error')
  busy.value = 'rekey'
  try {
    const dataJson = decryptWithKey(keyFromHex(ledger.keyHex), localStorage.getItem(`gb:data:${ledger.meta.id}`)!)
    const { makeVerifier, randomSalt } = await import('@/lib/crypto')
    const salt = randomSalt()
    const ndk = deriveKey(f.newPw, salt)
    const newPayload = encryptWithKey(dataJson, ndk.key, salt)
    localStorage.setItem(`gb:data:${ledger.meta.id}`, newPayload)
    // 更新 meta（salt/verifier）
    const ev = events.getEvent(ledger.meta.id)
    if (ev) {
      ev.salt = salt
      ev.verifier = makeVerifier(ndk)
      // events persist
      const list = events.list
      localStorage.setItem('gb:events', JSON.stringify(list))
    }
    const hex = keyToHex(ndk.key)
    sessionStorage.setItem(`gb:session-key:${ledger.meta.id}`, hex)
    ledger.unlock(events.getEvent(ledger.meta.id)!, f.newPw)
    showRekey.value = false
    ui.toast('管理密码已修改', 'success')
  } finally {
    busy.value = ''
  }
}

/* ---------- 副屏设置 ---------- */
const qrWechatInput = ref<HTMLInputElement>()
const qrAlipayInput = ref<HTMLInputElement>()

async function onQrChange(which: 'wechat' | 'alipay', e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const url = await fileToCompressedDataUrl(file, 720, 0.85)
    ledger.updateSettings({ [which === 'wechat' ? 'qrWechat' : 'qrAlipay']: url })
    ui.toast('收款码已更新', 'success')
  } catch {
    ui.toast('图片读取失败', 'error')
  } finally {
    ;(which === 'wechat' ? qrWechatInput.value : qrAlipayInput.value)!.value = ''
  }
}
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-2">
    <!-- 导出 -->
    <div class="gb-card p-4">
      <h3 class="gb-title-kai mb-1 font-bold">归档导出</h3>
      <p class="mb-3 text-xs text-ink-soft">
        当前有效 {{ ledger.totalCount }} 笔 · 合计 ￥{{ formatAmount(ledger.totalAmount) }}。活动结束后建议同时导出三类文件并云端收藏。
      </p>
      <div class="flex flex-col gap-2">
        <button class="gb-btn gb-btn-primary justify-start" :disabled="busy === 'pdf'" @click="doExportExcel">
          📊 导出 Excel 明细
        </button>

        <div class="rounded-lg border border-line p-3">
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-medium">传统竖排 PDF 礼簿</span>
            <span v-if="genProgress" class="text-xs text-primary">{{ genProgress }}</span>
          </div>
          <div class="mt-2 grid grid-cols-[1fr_auto] gap-2">
            <input v-model="recorder" class="gb-input text-sm" placeholder="记账人（落款，选填）" />
            <button class="gb-btn gb-btn-ghost" @click="coverInput?.click()">
              {{ coverDataUrl ? '更换封面' : '上传封面' }}
            </button>
            <input ref="coverInput" type="file" accept="image/*" class="hidden" @change="onCoverChange" />
          </div>
          <img v-if="coverDataUrl" :src="coverDataUrl" class="mt-2 h-24 rounded-md border border-line object-cover" alt="封面预览" />
          <button
            class="gb-btn gb-btn-primary mt-2 w-full"
            :disabled="busy === 'pdf'"
            @click="doGeneratePdf"
          >
            {{ busy === 'pdf' ? '生成中…' : '📜 生成 PDF 礼簿（仿古竖排版式）' }}
          </button>
        </div>

        <button class="gb-btn gb-btn-ghost justify-start" :disabled="busy === 'backup'" @click="doExportBackup">
          🔐 导出加密备份（.giftbook.json，可跨设备恢复）
        </button>
        <button class="gb-btn gb-btn-ghost justify-start" @click="showRekey = !showRekey">
          🔑 修改管理密码
        </button>

        <div v-if="showRekey" class="gb-pop grid gap-2 rounded-lg border border-line p-3">
          <input v-model="rekeyForm.oldPw" type="password" class="gb-input text-sm" placeholder="原密码" />
          <input v-model="rekeyForm.newPw" type="password" class="gb-input text-sm" placeholder="新密码（至少 4 位）" />
          <input v-model="rekeyForm.newPw2" type="password" class="gb-input text-sm" placeholder="确认新密码" @keydown.enter="doRekey" />
          <button class="gb-btn gb-btn-primary" :disabled="busy === 'rekey'" @click="doRekey">确认修改</button>
        </div>
      </div>
    </div>

    <!-- 设置 -->
    <div class="gb-card p-4">
      <h3 class="gb-title-kai mb-3 font-bold">记账与副屏设置</h3>
      <div class="flex flex-col gap-3 text-sm">
        <label class="flex cursor-pointer items-center justify-between gap-2">
          <span>语音播报核对 <span class="text-xs text-ink-soft">（登记后播报姓名与金额）</span></span>
          <input
            type="checkbox"
            class="h-4 w-4 accent-primary"
            :checked="ledger.settings.voiceEnabled"
            @change="ledger.updateSettings({ voiceEnabled: ($event.target as HTMLInputElement).checked })"
          />
        </label>
        <label class="flex cursor-pointer items-center justify-between gap-2">
          <span>副屏隐私模式 <span class="text-xs text-ink-soft">（仅最新一笔明示，其余姓名打码、金额隐藏）</span></span>
          <input
            type="checkbox"
            class="h-4 w-4 accent-primary"
            :checked="ledger.settings.guestPrivacy"
            @change="ledger.updateSettings({ guestPrivacy: ($event.target as HTMLInputElement).checked })"
          />
        </label>
        <label class="flex cursor-pointer items-center justify-between gap-2">
          <span>副屏显示收款码</span>
          <input
            type="checkbox"
            class="h-4 w-4 accent-primary"
            :checked="ledger.settings.showQr"
            @change="ledger.updateSettings({ showQr: ($event.target as HTMLInputElement).checked })"
          />
        </label>

        <div v-if="ledger.settings.showQr" class="gb-pop grid grid-cols-2 gap-2">
          <div class="rounded-lg border border-line p-2 text-center">
            <img v-if="ledger.settings.qrWechat" :src="ledger.settings.qrWechat" class="mx-auto h-20 object-contain" alt="微信收款码" />
            <div v-else class="flex h-20 items-center justify-center text-xs text-ink-soft">未上传</div>
            <button class="gb-btn gb-btn-ghost mt-1 w-full px-2 py-1 text-xs" @click="qrWechatInput?.click()">
              微信收款码
            </button>
            <input ref="qrWechatInput" type="file" accept="image/*" class="hidden" @change="onQrChange('wechat', $event)" />
          </div>
          <div class="rounded-lg border border-line p-2 text-center">
            <img v-if="ledger.settings.qrAlipay" :src="ledger.settings.qrAlipay" class="mx-auto h-20 object-contain" alt="支付宝收款码" />
            <div v-else class="flex h-20 items-center justify-center text-xs text-ink-soft">未上传</div>
            <button class="gb-btn gb-btn-ghost mt-1 w-full px-2 py-1 text-xs" @click="qrAlipayInput?.click()">
              支付宝收款码
            </button>
            <input ref="qrAlipayInput" type="file" accept="image/*" class="hidden" @change="onQrChange('alipay', $event)" />
          </div>
        </div>

        <div>
          <span class="gb-label">副屏公告文字（选填）</span>
          <input
            :value="ledger.settings.guestNotice"
            class="gb-input text-sm"
            placeholder="如：感谢各位亲友莅临"
            @change="ledger.updateSettings({ guestNotice: ($event.target as HTMLInputElement).value || undefined })"
          />
        </div>

        <p class="rounded-lg bg-surface px-3 py-2 text-xs leading-relaxed text-ink-soft">
          提示：副屏通过本机页签广播实时同步，无需联网、不读取加密库 ——
          即使副屏页面被他人打开，也仅能看到主屏主动推送的脱敏内容。
        </p>
      </div>
    </div>
  </div>
</template>
