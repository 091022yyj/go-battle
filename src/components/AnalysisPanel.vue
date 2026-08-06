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

const scoreText = computed(() => {
  if (!a.latest) return '—'
  const s = a.latest.score
  return s > 0 ? `+${s.toFixed(1)} 目` : `${s.toFixed(1)} 目`
})

// 目差条：黑方视角，正值 = 黑优
const leadBarPercent = computed(() => {
  if (!a.latest) return 50
  const s = Math.max(-30, Math.min(30, a.latest.score))
  return 50 + (s / 30) * 50
})

function curveSvg(): string {
  if (a.curve.length < 2) return ''
  const w = 220
  const h = 50
  const pts = a.curve.map((c, i) => {
    const x = (i / (a.curve.length - 1)) * w
    const y = h - c.winRate * h
    return `${x.toFixed(0)},${y.toFixed(0)}`
  }).join(' ')

  // Fill area under curve
  const areaPts = `0,${h} ${pts} ${w},${h}`
  return `
    <polygon points="${areaPts}" fill="rgba(77,163,255,0.1)"/>
    <polyline points="${pts}" fill="none" stroke="#4da3ff" stroke-width="2"/>
    <line x1="0" y1="${h/2}" x2="${w}" y2="${h/2}" stroke="rgba(255,255,255,0.2)" stroke-dasharray="4,4"/>
  `
}
</script>

<template>
  <div class="panel" v-if="a.latest || a.running">
    <h3 class="panel-title">🔍 AI 分析</h3>
    <div class="metrics">
      <div class="metric">
        <span class="metric-label">胜率</span>
        <span class="metric-value win-rate">{{ winRateText }}</span>
      </div>
      <div class="metric">
        <span class="metric-label">目差</span>
        <span class="metric-value lead" :class="{ 'lead-good': (a.latest?.score ?? 0) > 0 }">{{ scoreText }}</span>
      </div>
    </div>
    <!-- 目差条（黑方视角） -->
    <div class="lead-bar-wrap" v-if="a.latest">
      <div class="lead-bar">
        <div class="lead-bar-fill" :style="{ width: leadBarPercent + '%' }"></div>
        <div class="lead-bar-center"></div>
      </div>
      <div class="lead-labels">
        <span>黑优</span>
        <span>白优</span>
      </div>
    </div>
    <div class="best-move">
      <span class="metric-label">推荐着法</span>
      <span class="metric-value move">{{ bestMoveText }}</span>
    </div>
    <div v-if="a.curve.length >= 2" class="curve-wrap">
      <div class="chart" v-html="`<svg viewBox='0 0 220 50' width='220' height='50'>${curveSvg()}</svg>`"></div>
      <div class="curve-labels">
        <span>100%</span>
        <span>50%</span>
        <span>0%</span>
      </div>
    </div>
    <p class="hint" v-if="a.running">⏳ 分析中…</p>
  </div>
  <div class="panel empty" v-else>
    <h3 class="panel-title">🔍 AI 分析</h3>
    <p class="empty-text">人机模式下自动显示</p>
  </div>
</template>

<style scoped>
.panel {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  padding: 16px;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: #aaa;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.metrics {
  display: flex;
  gap: 20px;
  margin-bottom: 10px;
}

.metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.metric-label {
  font-size: 11px;
  color: #777;
  text-transform: uppercase;
}

.metric-value {
  font-size: 20px;
  font-weight: 700;
  color: #e0e0e0;
}

.win-rate {
  color: #4da3ff;
}

.lead {
  color: #aaa;
}

.lead-good {
  color: #ffd34d;
}

.lead-bar-wrap {
  margin-bottom: 10px;
}

.lead-bar {
  position: relative;
  height: 6px;
  border-radius: 3px;
  background: linear-gradient(90deg, rgba(120,120,120,0.3), rgba(255,255,255,0.15), rgba(220,220,220,0.3));
  overflow: hidden;
}

.lead-bar-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: linear-gradient(90deg, rgba(255,211,77,0.9), rgba(77,163,255,0.9));
  border-radius: 3px;
  transition: width 0.4s ease;
}

.lead-bar-center {
  position: absolute;
  left: 50%;
  top: -1px;
  bottom: -1px;
  width: 2px;
  background: rgba(255,255,255,0.5);
}

.lead-labels {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #555;
  margin-top: 2px;
}

.move {
  font-size: 16px;
  color: #e8c170;
}

.best-move {
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.curve-wrap {
  margin-top: 8px;
}

.chart {
  border-radius: 4px;
  overflow: hidden;
}

.curve-labels {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #555;
  margin-top: 2px;
}

.hint {
  color: #ffd34d;
  font-size: 12px;
  margin-top: 8px;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.empty {
  text-align: center;
}

.empty-text {
  color: #555;
  font-size: 13px;
}
</style>
