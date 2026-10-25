<script setup lang="ts">
/**
 * 程序化 mock 二维码（占位示意）：seed 驱动伪随机模块图案 + 三个回字定位角。
 * 真实收款码应在「归档 → 记账与副屏设置」中上传，未上传时以此占位。
 */
import { computed } from 'vue'

const props = withDefaults(defineProps<{ seed: string; modules?: number }>(), { modules: 25 })

const n = computed(() => props.modules)

function makeRand(seed: string) {
  let h = 2166136261
  for (const c of seed) {
    h ^= c.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

const cells = computed(() => {
  const size = n.value
  const r = makeRand(props.seed + '|' + size)
  const inFinder = (x: number, y: number) =>
    (x < 8 && y < 8) || (x > size - 9 && y < 8) || (x < 8 && y > size - 9)
  const list: { x: number; y: number }[] = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (inFinder(x, y)) continue
      if (r() < 0.45) list.push({ x, y })
    }
  }
  return list
})

// 三个回字定位角（7x7 外框 / 5x5 白圈 / 3x3 实心）
const finders = computed(() => {
  const size = n.value
  const o = 0
  const corners = [
    [0, 0],
    [size - 7, 0],
    [0, size - 7],
  ] as [number, number][]
  return corners.map(([fx, fy]) => {
    const cx = fx + 1
    const cy = fy + 1
    const sx = fx + 2
    const sy = fy + 2
    return { fx, fy, cx, cy, sx, sy }
  })
})
</script>

<template>
  <svg :viewBox="`0 0 ${n} ${n}`" class="h-full w-full" shape-rendering="crispEdges" aria-label="收款码占位">
    <rect width="100%" height="100%" fill="#fff" />
    <rect v-for="c in cells" :key="`${c.x}-${c.y}`" :x="c.x" :y="c.y" width="1" height="1" fill="#1f2937" />
    <template v-for="f in finders" :key="`${f.fx}-${f.fy}`">
      <rect :x="f.fx" :y="f.fy" width="7" height="7" fill="#1f2937" />
      <rect :x="f.cx" :y="f.cy" width="5" height="5" fill="#fff" />
      <rect :x="f.sx" :y="f.sy" width="3" height="3" fill="#1f2937" />
    </template>
  </svg>
</template>
