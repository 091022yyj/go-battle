<script setup lang="ts">
import { computed, watch } from 'vue'
import GoBoard from './components/GoBoard.vue'
import ControlBar from './components/ControlBar.vue'
import AnalysisPanel from './components/AnalysisPanel.vue'
import MoveList from './components/MoveList.vue'
import StatusAlert from './components/StatusAlert.vue'
import { useGameStore } from './stores/game'

const g = useGameStore()

const score = computed(() => g.score)

const turnLabel = computed(() => {
  if (g.state.finished) return '对局结束'
  const color = g.state.turn === 1 ? '⚫ 黑方' : '⚪ 白方'
  if (g.mode === 'evc') return `${color} AI 计算中...`
  return g.state.turn === g.humanColor ? '🙋 请你落子' : '🤖 AI 思考中...'
})

const resultLabel = computed(() => {
  if (!g.state.finished) return ''
  if (g.resigner) return `${g.resigner === 1 ? '⚫ 黑方' : '⚪ 白方'}认输`
  const s = g.score
  if (s.black - s.white > g.komi) return '⚫ 黑方胜'
  if (s.white - s.black > g.komi) return '⚪ 白方胜'
  return '平局'
})

const leadDiff = computed(() => {
  const s = g.score
  return (s.black - s.white - g.komi).toFixed(1)
})

// ---- 落子音效（Web Audio 生成"嗒"声，无外部文件）----
let audioCtx: AudioContext | null = null
function playStoneSound() {
  try {
    audioCtx = audioCtx || new AudioContext()
    const t = audioCtx.currentTime
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(900, t)
    osc.frequency.exponentialRampToValueAtTime(480, t + 0.05)
    gain.gain.setValueAtTime(0.15, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07)
    osc.connect(gain).connect(audioCtx.destination)
    osc.start(t)
    osc.stop(t + 0.08)
  } catch {
    // 音频不可用时静默忽略
  }
}
watch(
  () => g.state.history.length,
  (len, old) => {
    if (len > old) playStoneSound()
  }
)

// 终局弹窗
const showOverlay = computed(() => g.state.finished)

function newGameFromOverlay() {
  window.dispatchEvent(new CustomEvent('go-battle:new-game'))
}

function reviewGame() {
  g.state = { ...g.state, finished: false }
  g.jumpTo(0)
}
</script>

<template>
  <div class="app">
    <header class="header">
      <h1>🎋 围棋对战平台</h1>
      <span class="subtitle">Go Battle</span>
    </header>

    <ControlBar />
    <StatusAlert />

    <div class="status-bar">
      <span class="turn" :class="{ finished: g.state.finished }">
        {{ turnLabel }}
      </span>
      <span v-if="g.state.finished" class="result">{{ resultLabel }}</span>
    </div>

    <div class="main">
      <div class="board-section">
        <GoBoard />
        <div class="score-bar">
          <span class="black-score">⚫ {{ score.black }} 子</span>
          <span class="komi">贴目 {{ g.komi }}</span>
          <span class="white-score">{{ score.white }} 子 ⚪</span>
        </div>
      </div>

      <aside class="side-panels">
        <AnalysisPanel />
        <MoveList />
      </aside>
    </div>

    <!-- 终局弹窗 -->
    <div v-if="showOverlay" class="overlay">
      <div class="overlay-card">
        <h2 class="overlay-title">{{ resultLabel }}</h2>
        <p class="overlay-sub">
          {{ g.resigner ? '' : `黑 ${score.black} 子 · 白 ${score.white} 子 · 黑贴 ${g.komi}` }}
        </p>
        <p v-if="!g.resigner" class="overlay-diff">
          目差 {{ leadDiff }} 目
        </p>
        <div class="overlay-actions">
          <button class="overlay-btn primary" @click="newGameFromOverlay">🔄 再来一局</button>
          <button class="overlay-btn" @click="reviewGame">📜 复盘</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Segoe UI', 'PingFang SC', 'Noto Sans SC', system-ui, sans-serif;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  color: #e0e0e0;
  min-height: 100vh;
}

.app {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100vh;
}

.header {
  text-align: center;
  padding: 8px 0;
}

.header h1 {
  font-size: 28px;
  font-weight: 700;
  background: linear-gradient(135deg, #e8c170, #c49530);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtitle {
  font-size: 13px;
  color: #888;
  letter-spacing: 3px;
}

.status-bar {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  padding: 8px 20px;
  background: rgba(255,255,255,0.05);
  border-radius: 10px;
  font-size: 16px;
  font-weight: 500;
}

.turn {
  padding: 4px 16px;
  border-radius: 20px;
  background: rgba(232,193,112,0.15);
  color: #e8c170;
}

.turn.finished {
  background: rgba(255,100,100,0.15);
  color: #ff6464;
}

.result {
  font-size: 18px;
  font-weight: 700;
  color: #ffd34d;
}

.main {
  display: flex;
  gap: 20px;
  align-items: flex-start;
  justify-content: center;
}

.board-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.score-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 24px;
  background: rgba(255,255,255,0.06);
  border-radius: 8px;
  font-size: 15px;
  font-weight: 500;
}

.black-score { color: #e0e0e0; }
.white-score { color: #e0e0e0; }
.komi { color: #888; font-size: 13px; }

.side-panels {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 260px;
  max-width: 300px;
}

.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.overlay-card {
  background: linear-gradient(160deg, #24304a, #1a2233);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 16px;
  padding: 36px 48px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  animation: popIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes popIn {
  from { transform: scale(0.8); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.overlay-title {
  font-size: 26px;
  margin-bottom: 10px;
  color: #ffd34d;
}

.overlay-sub {
  color: #999;
  font-size: 14px;
}

.overlay-diff {
  color: #4da3ff;
  font-size: 16px;
  margin-top: 6px;
  font-weight: 600;
}

.overlay-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 24px;
}

.overlay-btn {
  padding: 10px 22px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.2);
  background: rgba(255,255,255,0.08);
  color: #ddd;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.overlay-btn:hover {
  background: rgba(255,255,255,0.15);
}

.overlay-btn.primary {
  background: rgba(232,193,112,0.2);
  border-color: rgba(232,193,112,0.4);
  color: #e8c170;
}

.overlay-btn.primary:hover {
  background: rgba(232,193,112,0.3);
}

@media (max-width: 900px) {
  .main {
    flex-direction: column;
    align-items: center;
  }
  .side-panels {
    width: 100%;
    max-width: 100%;
  }
}
</style>
