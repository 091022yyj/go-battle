<script setup lang="ts">
import { computed } from 'vue'
import GoBoard from './components/GoBoard.vue'
import ControlBar from './components/ControlBar.vue'
import AnalysisPanel from './components/AnalysisPanel.vue'
import MoveList from './components/MoveList.vue'
import { useGameStore } from './stores/game'

const g = useGameStore()

const score = computed(() => g.score)
</script>

<template>
  <div class="app">
    <h1>围棋对战平台</h1>
    <ControlBar />
    <p v-if="g.state.finished" class="over">
      对局结束{{ g.resigner ? `：${g.resigner === 1 ? '黑' : '白'}方认输` : '' }}
    </p>
    <p class="score">
      黑 {{ score.black }} 子 / 白 {{ score.white }} 子（贴目 {{ g.komi }}）
    </p>
    <div class="main">
      <div class="board-wrap">
        <GoBoard />
      </div>
      <AnalysisPanel />
      <MoveList />
    </div>
  </div>
</template>

<style>
body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: #2b2b2b;
  color: #eee;
}
.app {
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.main {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  flex-wrap: wrap;
  justify-content: center;
}
.over {
  color: #ffd34d;
  font-weight: bold;
}
.score {
  font-size: 14px;
  color: #aaa;
}
</style>
