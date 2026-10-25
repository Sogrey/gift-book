<script setup lang="ts">
/** 统计面板：总览卡 / 渠道占比 / 金额分布 / Top 榜（纯 CSS 图，零图表依赖） */
import { computed } from 'vue'
import { useLedgerStore } from '@/stores/ledger'
import { CHANNELS } from '@/types'
import { formatAmount } from '@/lib/amount'

const ledger = useLedgerStore()

const channelRows = computed(() => {
  const total = ledger.totalAmount || 1
  return ledger.byChannel.map((c) => {
    const label = CHANNELS.find((x) => x.key === c.channel)?.label ?? c.channel
    const pct = (c.amount / total) * 100
    return { ...c, label, pct: Math.max(pct, c.count ? 2 : 0) }
  })
})

const bucketMax = computed(() => Math.max(1, ...ledger.amountBuckets.map((b) => b.count)))
const channelColor = (i: number) => ['#b91c1c', '#c9a063', '#475569', '#94a3b8'][i % 4]
</script>

<template>
  <div class="grid gap-4">
    <!-- 总览 -->
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div class="gb-card p-4">
        <div class="text-xs text-ink-soft">礼金总额</div>
        <div class="font-num mt-1 text-2xl font-bold text-primary">￥{{ formatAmount(ledger.totalAmount) }}</div>
        <div class="mt-1 text-xs text-ink-soft">{{ ledger.toChineseAmount(ledger.totalAmount) }}</div>
      </div>
      <div class="gb-card p-4">
        <div class="text-xs text-ink-soft">有效笔数</div>
        <div class="font-num mt-1 text-2xl font-bold">{{ ledger.totalCount }}</div>
        <div class="mt-1 text-xs text-ink-soft">今日 {{ ledger.todayCount }} 笔</div>
      </div>
      <div class="gb-card p-4">
        <div class="text-xs text-ink-soft">平均礼金</div>
        <div class="font-num mt-1 text-2xl font-bold">
          ￥{{ formatAmount(ledger.totalCount ? ledger.totalAmount / ledger.totalCount : 0) }}
        </div>
        <div class="mt-1 text-xs text-ink-soft">按有效记录计算</div>
      </div>
      <div class="gb-card p-4">
        <div class="text-xs text-ink-soft">最高单笔</div>
        <div class="font-num mt-1 text-2xl font-bold">
          ￥{{ formatAmount(ledger.topGivers[0]?.amount ?? 0) }}
        </div>
        <div class="gb-title-kai mt-1 text-xs">{{ ledger.topGivers[0]?.name ?? '—' }}</div>
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <!-- 渠道占比 -->
      <div class="gb-card p-4">
        <h3 class="gb-title-kai mb-3 font-bold">渠道分布</h3>
        <div v-if="channelRows.length" class="flex flex-col gap-3">
          <div v-for="(row, i) in channelRows" :key="row.channel">
            <div class="mb-1 flex items-center justify-between text-sm">
              <span>{{ row.label }} · {{ row.count }} 人</span>
              <span class="font-num text-ink-soft">￥{{ formatAmount(row.amount) }}</span>
            </div>
            <div class="h-2.5 overflow-hidden rounded-full bg-primary-soft">
              <div
                class="h-full rounded-full transition-all duration-500"
                :style="{ width: row.pct + '%', background: channelColor(i) }"
              />
            </div>
          </div>
        </div>
        <div v-else class="py-8 text-center text-sm text-ink-soft">暂无数据</div>
      </div>

      <!-- 金额分布 -->
      <div class="gb-card p-4">
        <h3 class="gb-title-kai mb-3 font-bold">礼金分布</h3>
        <div v-if="ledger.totalCount" class="flex h-44 items-end gap-3 px-1">
          <div
            v-for="b in ledger.amountBuckets"
            :key="b.label"
            class="flex flex-1 flex-col items-center gap-1"
          >
            <span class="text-xs text-ink-soft">{{ b.count }}</span>
            <div
              class="w-full rounded-t-md bg-primary/85 transition-all duration-500"
              :style="{ height: Math.max(4, (b.count / bucketMax) * 130) + 'px' }"
            />
            <span class="mt-1 text-[11px] leading-tight text-ink-soft">{{ b.label }}</span>
          </div>
        </div>
        <div v-else class="py-8 text-center text-sm text-ink-soft">暂无数据</div>
      </div>
    </div>

    <!-- Top 榜 -->
    <div class="gb-card p-4">
      <h3 class="gb-title-kai mb-3 font-bold">礼金前十</h3>
      <div v-if="ledger.topGivers.length" class="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <div
          v-for="(r, i) in ledger.topGivers"
          :key="r.id"
          class="flex items-center gap-2.5 rounded-lg border border-line/70 px-3 py-2"
        >
          <span
            class="gb-title-kai flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white"
            :class="i === 0 ? 'ring-2 ring-accent ring-offset-1' : ''"
          >
            {{ i + 1 }}
          </span>
          <span class="gb-title-kai truncate font-bold">{{ r.name }}</span>
          <span class="font-num ml-auto text-sm font-semibold">￥{{ formatAmount(r.amount) }}</span>
        </div>
      </div>
      <div v-else class="py-8 text-center text-sm text-ink-soft">暂无数据</div>
    </div>
  </div>
</template>
