<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from '../stores/game'
import { useEngineStore } from '../stores/engine'
import { useAnalysisStore } from '../stores/analysis'
import { createSimpleAI } from '../engine/ai/simple-ai'
import type { EngineAdapter } from '../engine/types'

const g = useGameStore()
const e = useEngineStore()
const a = useAnalysisStore()
const size = ref(19)
const mode = ref<'pvp' | 'pve' | 'evc'>('pvp')
const humanColor = ref<1 | -1>(1)
const level = ref(3)

function startGame() {
  e.stop()
  a.reset()
  g.newGame(size.value, mode.value, 3.75)
  if (mode.value === 'pve') {
    g.humanColor = humanColor.value
    const ai: EngineAdapter = createSimpleAI(g.humanColor === 1 ? -1 : 1)
    ai.setLevel(level.value)
    e.startPve(g, ai)
  } else if (mode.value === 'evc') {
    const black: EngineAdapter = createSimpleAI(1)
    const white: EngineAdapter = createSimpleAI(-1)
    black.setLevel(level.value)
    white.setLevel(level.value)
    e.startEvc(g, black, white)
  }
}
</script>

<template>
  <div class="control">
    <div class="control-group">
      <label class="ctrl-label">
        <span class="label-text">棋盘</span>
        <select v-model="size" @change="startGame">
          <option :value="9">9 路</option>
          <option :value="13">13 路</option>
          <option :value="19">19 路</option>
        </select>
      </label>

      <label class="ctrl-label">
        <span class="label-text">模式</span>
        <select v-model="mode" @change="startGame">
          <option value="pvp">👥 双人对弈</option>
          <option value="pve">🤖 人机对战</option>
          <option value="evc">⚔️ AI vs AI</option>
        </select>
      </label>

      <label v-if="mode === 'pve'" class="ctrl-label">
        <span class="label-text">执子</span>
        <select v-model="humanColor" @change="startGame">
          <option :value="1">⚫ 执黑</option>
          <option :value="-1">⚪ 执白</option>
        </select>
      </label>

      <label class="ctrl-label">
        <span class="label-text">棋力</span>
        <select v-model="level" @change="startGame">
          <option v-for="l in 5" :key="l" :value="l">⭐ {{ l }}</option>
        </select>
      </label>
    </div>

    <div class="control-group actions">
      <button class="btn btn-primary" @click="startGame">🔄 新局</button>
      <button class="btn" @click="g.undo()" :disabled="g.state.history.length === 0">↩ 悔棋</button>
      <button class="btn" @click="g.passTurn()" :disabled="g.state.finished || !g.isHumanTurn">✋ Pass</button>
      <button class="btn btn-danger" @click="g.resign()" :disabled="g.state.finished">🏳 认输</button>
    </div>
  </div>
</template>

<style scoped>
.control {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  flex-wrap: wrap;
  padding: 12px 20px;
  background: rgba(255,255,255,0.05);
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.08);
}

.control-group {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.ctrl-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.label-text {
  font-size: 11px;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 1px;
}

select {
  padding: 7px 32px 7px 12px;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.15);
  background: rgba(255,255,255,0.08);
  color: #e0e0e0;
  font-size: 14px;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M6 8L1 3h10z' fill='%23888'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  transition: border-color 0.2s;
}

select:hover {
  border-color: rgba(232,193,112,0.4);
}

select:focus {
  outline: none;
  border-color: #e8c170;
}

.btn {
  padding: 7px 16px;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.15);
  background: rgba(255,255,255,0.08);
  color: #ccc;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:hover:not(:disabled) {
  background: rgba(255,255,255,0.14);
  border-color: rgba(255,255,255,0.25);
}

.btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.btn-primary {
  background: rgba(232,193,112,0.2);
  border-color: rgba(232,193,112,0.3);
  color: #e8c170;
}

.btn-primary:hover:not(:disabled) {
  background: rgba(232,193,112,0.3);
}

.btn-danger {
  border-color: rgba(255,100,100,0.3);
  color: #ff8080;
}

.btn-danger:hover:not(:disabled) {
  background: rgba(255,100,100,0.15);
}

.actions {
  gap: 6px;
}
</style>
