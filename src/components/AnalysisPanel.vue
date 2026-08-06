<script setup lang="ts">
import { computed } from 'vue'
import { useAnalysisStore } from '../stores/analysis'

const a = useAnalysisStore()

const winRateText = computed(() => {
  if (!a.latest) return '—'
  return `${(a.latest.winRate * 100).toFixed(1)}%`
})

const bestMoveText = computed(() => {
  if (!a.latest?.bestMove.point) return '—'
  const p = a.latest.bestMove.point
  const cols = 'ABCDEFGHJKLMNOPQRST'
  return `${cols[p.x]}${p.y + 1}`
})

function curveSvg(): string {
  if (a.curve.length < 2) return ''
  const w = 240
  const h = 60
  const max = a.curve.length - 1
  const pts = a.curve
    .map((c, i) => {
      const x = (i / max) * w
      const y = h - c.winRate * h
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return `<polyline points="${pts}" fill="none" stroke="#4da3ff" stroke-width="1.5"/>`
}
</script>

<template>
  <div class="panel">
    <h3>AI 分析</h3>
    <p class="rate">胜率：<b>{{ winRateText }}</b></p>
    <p>最佳着法：{{ bestMoveText }}</p>
    <div class="curve" v-html="`<svg viewBox='0 0 240 60' width='240' height='60' style='background:#222'>${curveSvg()}</svg>`"></div>
    <p class="hint" v-if="a.running">分析中…</p>
  </div>
</template>

<style scoped>
.panel {
  background: #333;
  border-radius: 8px;
  padding: 12px;
  min-width: 260px;
}
.rate b {
  color: #4da3ff;
}
.hint {
  color: #ffd34d;
  font-size: 12px;
}
</style>
