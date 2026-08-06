<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGameStore } from '../stores/game'
import { useEngineStore } from '../stores/engine'
import { useAnalysisStore } from '../stores/analysis'
import { createSimpleAI } from '../engine/ai/simple-ai'
import { createGTPEngine, type GTPConfig } from '../engine/ai/gtp-engine'
import { KataWasmEngine } from '../engine/ai/kata-wasm'
import type { EngineAdapter } from '../engine/types'

const g = useGameStore()
const e = useEngineStore()
const a = useAnalysisStore()

const size = ref(19)
const mode = ref<'pve' | 'evc'>('pve')
const humanColor = ref<1 | -1>(1)
const level = ref(3)
const engineType = ref<'simple' | 'kata-wasm' | 'kata-gtp'>('simple')

// GTP config (saved to localStorage)
const storedConfig = localStorage.getItem('gtp-config')
const gtpConfig = ref<GTPConfig>(
  storedConfig
    ? JSON.parse(storedConfig)
    : { host: 'localhost', port: 3333, engineName: 'kata-go' }
)

function saveGTPConfig() {
  localStorage.setItem('gtp-config', JSON.stringify(gtpConfig.value))
}

const gtpStatus = ref<'disconnected' | 'connecting' | 'connected'>('disconnected')

async function testGTPConnection() {
  gtpStatus.value = 'connecting'
  try {
    const engine = createGTPEngine(1, gtpConfig.value)
    await engine.connect()
    engine.dispose()
    gtpStatus.value = 'connected'
    setTimeout(() => { gtpStatus.value = 'disconnected' }, 3000)
  } catch {
    gtpStatus.value = 'disconnected'
    e.errorMessage = `无法连接到 GTP 桥接 (${gtpConfig.value.host}:${gtpConfig.value.port})。请运行: node server/bridge.mjs --engine <引擎路径>`
  }
}

function createEngine(player: 1 | -1): EngineAdapter {
  switch (engineType.value) {
    case 'simple': {
      const ai = createSimpleAI(player)
      ai.setLevel(level.value)
      return ai
    }
    case 'kata-wasm': {
      return new KataWasmEngine()
    }
    case 'kata-gtp': {
      return createGTPEngine(player, gtpConfig.value)
    }
  }
}

async function startGame() {
  e.stop()
  a.reset()
  g.newGame(size.value, mode.value, 3.75)

  try {
    if (mode.value === 'pve') {
      g.humanColor = humanColor.value
      const ai = createEngine(g.humanColor === 1 ? -1 : 1)
      e.startPve(g, ai)
    } else if (mode.value === 'evc') {
      const black = createEngine(1)
      const white = createEngine(-1)
      e.startEvc(g, black, white)
    }
  } catch (err) {
    e.errorMessage = (err as Error).message
    // Fallback to SimpleAI
    if (engineType.value !== 'simple') {
      e.errorMessage += ' 已自动切换为 Simple AI。'
      const fallback = createSimpleAI(humanColor.value === 1 ? -1 : 1)
      fallback.setLevel(level.value)
      if (mode.value === 'pve') {
        e.startPve(g, fallback)
      }
    }
  }
}

// Engine status display
const engineStatusText = computed(() => {
  const active = e.active
  if (!active) return ''
  if (active.status === 'thinking') return '🤔 思考中...'
  if (active.status === 'error') return '❌ 引擎错误'
  return '🟢 就绪'
})
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
        <span class="label-text">引擎</span>
        <select v-model="engineType" @change="startGame">
          <option value="simple">🧠 Simple AI</option>
          <option value="kata-wasm">🌐 KataGo WASM</option>
          <option value="kata-gtp">🔌 GTP 桥接</option>
        </select>
      </label>

      <label v-if="engineType === 'simple'" class="ctrl-label">
        <span class="label-text">棋力</span>
        <select v-model="level" @change="startGame">
          <option v-for="l in 5" :key="l" :value="l">⭐ {{ l }}</option>
        </select>
      </label>
    </div>

    <!-- GTP Config Panel -->
    <div v-if="engineType === 'kata-gtp'" class="gtp-config">
      <div class="config-row">
        <label class="mini-label">
          主机 <input v-model="gtpConfig.host" @change="saveGTPConfig()" placeholder="localhost" size="12" />
        </label>
        <label class="mini-label">
          端口 <input v-model.number="gtpConfig.port" @change="saveGTPConfig()" type="number" size="6" />
        </label>
        <label class="mini-label">
          引擎
          <select v-model="gtpConfig.engineName" @change="saveGTPConfig()">
            <option value="kata-go">KataGo</option>
            <option value="sayuri">Sayuri</option>
          </select>
        </label>
        <button class="btn btn-small" @click="testGTPConnection">
          {{ gtpStatus === 'connecting' ? '...' : gtpStatus === 'connected' ? '✅' : '测试连接' }}
        </button>
      </div>
    </div>

    <!-- Error Alert -->
    <div v-if="e.errorMessage" class="error-alert">
      <span>⚠️ {{ e.errorMessage }}</span>
      <button class="btn-close" @click="e.errorMessage = null">✕</button>
    </div>

    <div class="control-group actions">
      <button class="btn btn-primary" @click="startGame">🔄 新局</button>
      <button class="btn" @click="g.undo()" :disabled="g.state.history.length === 0">↩ 悔棋</button>
      <button class="btn" @click="g.passTurn()" :disabled="g.state.finished || !g.isHumanTurn">✋ Pass</button>
      <button class="btn btn-danger" @click="g.resign()" :disabled="g.state.finished">🏳 认输</button>
      <span v-if="engineStatusText" class="engine-status">{{ engineStatusText }}</span>
    </div>
  </div>
</template>

<style scoped>
.control {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  background: rgba(255,255,255,0.05);
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.08);
}

.control-group {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  flex-wrap: wrap;
  justify-content: center;
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

select, input {
  padding: 7px 32px 7px 12px;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.15);
  background: rgba(255,255,255,0.08);
  color: #e0e0e0;
  font-size: 14px;
  transition: border-color 0.2s;
}

select {
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M6 8L1 3h10z' fill='%23888'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
}

input[type="number"] {
  width: 70px;
  padding-right: 8px;
}

select:hover, input:hover {
  border-color: rgba(232,193,112,0.4);
}

select:focus, input:focus {
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

.btn-small {
  padding: 5px 10px;
  font-size: 12px;
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
  align-items: center;
}

.gtp-config {
  padding: 8px 14px;
  background: rgba(255,255,255,0.04);
  border-radius: 8px;
  border: 1px dashed rgba(255,255,255,0.1);
}

.config-row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  flex-wrap: wrap;
}

.mini-label {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 11px;
  color: #888;
}

.error-alert {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: rgba(255,80,80,0.15);
  border: 1px solid rgba(255,80,80,0.3);
  border-radius: 8px;
  color: #ff8080;
  font-size: 13px;
  max-width: 600px;
}

.btn-close {
  background: none;
  border: none;
  color: #ff8080;
  cursor: pointer;
  font-size: 16px;
  padding: 0 4px;
}

.engine-status {
  font-size: 13px;
  color: #aaa;
  margin-left: 8px;
}
</style>
