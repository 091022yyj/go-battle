<script setup lang="ts">
import { computed } from 'vue'
import GoBoard from './components/GoBoard.vue'
import ControlBar from './components/ControlBar.vue'
import AnalysisPanel from './components/AnalysisPanel.vue'
import MoveList from './components/MoveList.vue'
import { useGameStore } from './stores/game'

const g = useGameStore()

const score = computed(() => g.score)

const turnLabel = computed(() => {
  if (g.state.finished) return '对局结束'
  const color = g.state.turn === 1 ? '⚫ 黑方' : '⚪ 白方'
  if (g.mode === 'pvp') return `${color}落子`
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
</script>

<template>
  <div class="app">
    <header class="header">
      <h1>🎋 围棋对战平台</h1>
      <span class="subtitle">Go Battle</span>
    </header>

    <ControlBar />

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
