<script setup lang="ts">
import { useGameStore } from '../stores/game'

const g = useGameStore()
const COLS = 'ABCDEFGHJKLMNOPQRST'

function formatMove(m: { player: 1 | -1; point: { x: number; y: number } | null }, i: number): string {
  if (!m.point) return `${i + 1}. pass`
  const icon = m.player === 1 ? '⚫' : '⚪'
  return `${i + 1}. ${icon} ${COLS[m.point.x]}${m.point.y + 1}`
}

function exportSGF() {
  const blob = new Blob([g.toSGF()], { type: 'application/x-go-sgf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `game-${Date.now()}.sgf`
  a.click()
  URL.revokeObjectURL(url)
}

function onImport(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  if (!f) return
  const reader = new FileReader()
  reader.onload = () => {
    g.importSGF(String(reader.result))
  }
  reader.readAsText(f)
}
</script>

<template>
  <div class="panel">
    <div class="panel-header">
      <h3 class="panel-title">📜 棋谱</h3>
      <span class="move-count">{{ g.state.history.length }} 手</span>
    </div>

    <div class="nav">
      <button class="nav-btn" @click="g.jumpTo(0)" :disabled="g.cursor <= 0">⏮</button>
      <button class="nav-btn" @click="g.stepBack()" :disabled="g.cursor <= 0">◀</button>
      <span class="cursor-info">{{ g.cursor }} / {{ g.state.history.length }}</span>
      <button class="nav-btn" @click="g.stepForward()" :disabled="g.cursor >= g.state.history.length">▶</button>
      <button class="nav-btn" @click="g.jumpTo(g.state.history.length)" :disabled="g.cursor >= g.state.history.length">⏭</button>
    </div>

    <div class="list-wrap" v-if="g.state.history.length > 0">
      <div
        v-for="(m, i) in g.state.history"
        :key="i"
        class="move-item"
        :class="{ current: i === g.cursor - 1 }"
        @click="g.jumpTo(i + 1)"
      >
        {{ formatMove(m, i) }}
      </div>
    </div>
    <p class="empty" v-else>暂无棋谱</p>

    <div class="sgf-actions">
      <button class="sgf-btn" @click="exportSGF" :disabled="g.state.history.length === 0">📥 导出 SGF</button>
      <label class="sgf-btn import-label">
        📤 导入 SGF
        <input type="file" accept=".sgf" @change="onImport" hidden />
      </label>
    </div>
  </div>
</template>

<style scoped>
.panel {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  padding: 16px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: #aaa;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.move-count {
  font-size: 12px;
  color: #666;
  background: rgba(255,255,255,0.08);
  padding: 2px 8px;
  border-radius: 10px;
}

.nav {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}

.nav-btn {
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.05);
  color: #ccc;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.nav-btn:hover:not(:disabled) {
  background: rgba(255,255,255,0.12);
}

.nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.cursor-info {
  font-size: 12px;
  color: #888;
  min-width: 50px;
  text-align: center;
}

.list-wrap {
  max-height: 260px;
  overflow-y: auto;
  margin-bottom: 10px;
}

.list-wrap::-webkit-scrollbar {
  width: 4px;
}

.list-wrap::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.1);
  border-radius: 2px;
}

.move-item {
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: #bbb;
  transition: all 0.15s;
}

.move-item:hover {
  background: rgba(255,255,255,0.05);
}

.move-item.current {
  background: rgba(232,193,112,0.15);
  color: #e8c170;
  font-weight: 600;
}

.empty {
  color: #555;
  font-size: 13px;
  text-align: center;
  padding: 16px 0;
}

.sgf-actions {
  display: flex;
  gap: 8px;
}

.sgf-btn {
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.05);
  color: #bbb;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
  text-align: center;
}

.sgf-btn:hover:not(:disabled) {
  background: rgba(255,255,255,0.1);
}

.sgf-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.import-label {
  display: inline-block;
}
</style>
