<script setup lang="ts">
import { useGameStore } from '../stores/game'

const g = useGameStore()

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
  <div class="moves">
    <h3>棋谱（{{ g.state.history.length }} 手）</h3>
    <div class="nav">
      <button @click="g.jumpTo(0)">⏮</button>
      <button @click="g.stepBack()">◀</button>
      <button @click="g.stepForward()">▶</button>
      <button @click="g.jumpTo(g.state.history.length)">⏭</button>
    </div>
    <ol class="list">
      <li
        v-for="(m, i) in g.state.history"
        :key="i"
        :class="{ current: i === g.cursor - 1 }"
        @click="g.jumpTo(i + 1)"
      >
        {{ i + 1 }}. {{ m.point ? `(${m.point.x},${m.point.y})` : 'pass' }}
      </li>
    </ol>
    <div class="sgf">
      <button @click="exportSGF">导出 SGF</button>
      <input type="file" accept=".sgf" @change="onImport" />
    </div>
  </div>
</template>

<style scoped>
.moves {
  background: #333;
  border-radius: 8px;
  padding: 12px;
  min-width: 220px;
  max-height: 420px;
  overflow: auto;
}
.list li {
  cursor: pointer;
  font-size: 13px;
}
.list li.current {
  color: #4da3ff;
  font-weight: bold;
}
.nav button {
  margin: 0 2px;
}
.sgf {
  margin-top: 8px;
  display: flex;
  gap: 8px;
  align-items: center;
}
</style>
