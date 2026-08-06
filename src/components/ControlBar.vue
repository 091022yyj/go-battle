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

function restart() {
  startGame()
}
</script>

<template>
  <div class="control">
    <label>棋盘
      <select v-model="size" @change="startGame">
        <option :value="9">9路</option>
        <option :value="13">13路</option>
        <option :value="19">19路</option>
      </select>
    </label>
    <label>模式
      <select v-model="mode" @change="startGame">
        <option value="pvp">双人对弈</option>
        <option value="pve">人机对战</option>
        <option value="evc">AI vs AI</option>
      </select>
    </label>
    <label v-if="mode === 'pve'">执子
      <select v-model="humanColor" @change="startGame">
        <option :value="1">黑</option>
        <option :value="-1">白</option>
      </select>
    </label>
    <label>棋力
      <select v-model="level" @change="startGame">
        <option v-for="l in 5" :key="l" :value="l">{{ l }}</option>
      </select>
    </label>
    <button @click="restart">新局</button>
    <button @click="g.undo()">悔棋</button>
    <button @click="g.passTurn()">pass</button>
    <button @click="g.resign()">认输</button>
    <span class="status" v-if="e.active">AI 思考中…</span>
  </div>
</template>

<style scoped>
.control {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.status {
  color: #ffd34d;
}
</style>
