<script setup lang="ts">
/** 密码输入框：带可见切换（中文输入法下全角数字肉眼无法分辨，规范化 + 明文可见双保险） */
import { ref } from 'vue'

withDefaults(
  defineProps<{
    modelValue: string
    id?: string
    placeholder?: string
    /** 明文展示时说明（如确认密码框） */
    revealNote?: boolean
  }>(),
  { placeholder: '管理密码' },
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'enter', ev: KeyboardEvent): void
}>()

const visible = ref(false)
const input = ref<HTMLInputElement>()

function onKeydownEnter(e: KeyboardEvent) {
  emit('enter', e)
}
defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <div class="relative">
    <input
      :id="id"
      ref="input"
      :type="visible ? 'text' : 'password'"
      :value="modelValue"
      class="gb-input pr-10"
      :placeholder="placeholder"
      autocomplete="new-password"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @keydown.enter="onKeydownEnter($event)"
    />
    <button
      type="button"
      class="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-sm text-ink-soft hover:text-primary"
      :title="visible ? '隐藏密码' : '显示密码（请核对是否有全角字符）'"
      tabindex="-1"
      @click="visible = !visible"
    >
      {{ visible ? '🙈' : '👁' }}
    </button>
    <p v-if="revealNote && visible && /[\uFF01-\uFF5E\u3000]/.test(modelValue)" class="mt-1 text-xs text-red-600">
      ⚠ 检测到全角字符（输入法半角模式更保险），保存时将自动按半角处理
    </p>
  </div>
</template>
