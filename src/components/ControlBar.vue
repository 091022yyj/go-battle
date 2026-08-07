<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useGameStore } from '../stores/game'
import { useEngineStore } from '../stores/engine'
import { useAnalysisStore } from '../stores/analysis'
import { createSimpleAI } from '../engine/ai/simple-ai'
import { createGTPEngine, type GTPConfig, type GoRules, type GoStyle } from '../engine/ai/gtp-engine'
import { KataWasmEngine } from '../engine/ai/kata-wasm'
import type { EngineAdapter } from '../engine/types'

const g = useGameStore()
const e = useEngineStore()
const a = useAnalysisStore()

const size = ref(19)
const mode = ref<'pve' | 'evc'>('pve')
const humanColor = ref<1 | -1>(1)
const level = ref(3)
const engineType = ref<'simple' | 'kata-wasm' | 'kata-gtp'>('kata-gtp')
const rules = ref<GoRules>('chinese')
const style = ref<GoStyle>('balanced')

// 规则 → 贴目（目）
const RULE_KOMI: Record<GoRules, number> = {
  chinese: 7.5,   // 中国规则贴 7.5 目（数子 3.75 子）
  japanese: 6.5,  // 日韩规则贴 6.5 目
  ancient: 0,     // 古棋不贴目
}

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
const hintLoading = ref(false)
const showHistory = ref(false)
const showHandicap = ref(false)

/** 让子棋：摆 N 子黑棋星位，白先下 */
function startHandicap(n: number) {
  showHandicap.value = false
  g.handicapGame(n)
}

/** 恢复历史对局（importSGF 会停止旧引擎，需重新创建引擎并同步 UI 配置） */
function loadHistory(id: number) {
  g.restoreGame(id)
  showHistory.value = false
  // 同步配置 UI
  size.value = g.size
  mode.value = g.mode
  humanColor.value = g.humanColor
  // 重新创建引擎（恢复后 AI 继续工作）
  e.stop()
  if (g.mode === 'pve') {
    const ai = createEngine(g.humanColor === 1 ? -1 : 1)
    e.startPve(g, ai)
  } else if (g.mode === 'evc') {
    const shared = createGTPEngine(1, gtpConfig.value)
    shared.setLevel(level.value)
    shared.setRules(rules.value, RULE_KOMI[rules.value])
    shared.setStyle(style.value)
    e.startEvc(g, shared, shared)
  }
}

// 配置持久化 key：自动恢复上次设置并直接开始对局
const CONFIG_KEY = 'go-battle-config'

// 键盘快捷键
function onKeydown(e: KeyboardEvent) {
  // 输入框/下拉框聚焦时忽略快捷键，避免打字触发新局/Pass/悔棋
  const t = e.target as HTMLElement | null
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
  if (e.ctrlKey && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    g.undo()
  } else if (e.key.toLowerCase() === 'n') {
    startGame()
  } else if (e.key.toLowerCase() === 'p') {
    g.passTurn()
  }
}
function onNewGameEvent() {
  startGame()
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('go-battle:new-game', onNewGameEvent)
  // 恢复上次配置并自动开始对局（打开即玩，无需手动点「新局」）
  try {
    const saved = localStorage.getItem(CONFIG_KEY)
    if (saved) {
      const c = JSON.parse(saved)
      if (typeof c.size === 'number') size.value = c.size
      if (c.mode === 'pve' || c.mode === 'evc') mode.value = c.mode
      if (c.humanColor === 1 || c.humanColor === -1) humanColor.value = c.humanColor
      if (typeof c.level === 'number') level.value = c.level
      if (c.engineType === 'simple' || c.engineType === 'kata-wasm' || c.engineType === 'kata-gtp') engineType.value = c.engineType
      if (c.rules === 'chinese' || c.rules === 'japanese' || c.rules === 'ancient') rules.value = c.rules
      if (c.style === 'balanced' || c.style === 'solid' || c.style === 'aggressive') style.value = c.style
    }
  } catch {
    // 配置损坏时忽略，使用默认值
  }
  startGame()
})

// 持久化设置：用户修改任何配置时自动保存，下次打开/刷新自动恢复
watch([size, mode, humanColor, level, engineType, rules, style], () => {
  localStorage.setItem(
    CONFIG_KEY,
    JSON.stringify({
      size: size.value,
      mode: mode.value,
      humanColor: humanColor.value,
      level: level.value,
      engineType: engineType.value,
      rules: rules.value,
      style: style.value,
    })
  )
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('go-battle:new-game', onNewGameEvent)
})

/** 最佳着法提示：AI 分析当前局面并显示候选点 */
async function showHint() {
  if (hintLoading.value) return
  const engine = g.humanColor === 1 ? e.white : e.black
  if (!engine) return
  hintLoading.value = true
  try {
    const candidatesEngine = engine as unknown as {
      getCandidates?: (s: unknown, seconds?: number) => Promise<unknown[]>
    }
    if (typeof candidatesEngine.getCandidates === 'function') {
      const cands = await candidatesEngine.getCandidates(g.state, 2)
      a.setCandidates(cands as never)
      if (cands.length > 0) {
        const best = cands[0] as { point: { x: number; y: number } | null; winRate: number; scoreLead: number }
        a.setAnalysis(
          {
            score: best.scoreLead,
            winRate: best.winRate,
            bestMove: { player: g.state.turn, point: best.point },
            variations: best.point ? [[{ player: g.state.turn, point: best.point }]] : [],
            candidates: cands as never,
          },
          g.state.history.length + 1
        )
      }
    } else {
      const analysis = await engine.analyze(g.state)
      a.setAnalysis(analysis, g.state.history.length + 1)
      a.setCandidates(analysis.candidates ?? [])
    }
  } catch (err) {
    e.errorMessage = `分析失败: ${(err as Error).message}`
  } finally {
    hintLoading.value = false
  }
}

/** 暂停/继续 AI（人机与 EVS 通用） */
function togglePause() {
  if (e.paused) {
    e.resume(g as never)
  } else {
    e.pause()
  }
}

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
  let engine: EngineAdapter
  switch (engineType.value) {
    case 'simple': {
      engine = createSimpleAI(player)
      engine.setLevel(level.value)
      break
    }
    case 'kata-wasm': {
      engine = new KataWasmEngine()
      break
    }
    case 'kata-gtp': {
      const gtp = createGTPEngine(player, gtpConfig.value)
      gtp.setLevel(level.value)
      gtp.setRules(rules.value, RULE_KOMI[rules.value])
      gtp.setStyle(style.value)
      engine = gtp
      break
    }
  }
  return engine
}

async function startGame() {
  e.stop()
  a.reset()
  g.newGame(size.value, mode.value, RULE_KOMI[rules.value])

  try {
    if (mode.value === 'pve') {
      g.humanColor = humanColor.value
      const ai = createEngine(g.humanColor === 1 ? -1 : 1)
      e.startPve(g, ai)
    } else if (mode.value === 'evc') {
      if (engineType.value === 'kata-gtp') {
        // EVS 双引擎共用同一 GTP 连接：桥接只有一份引擎棋盘，
        // 两个独立连接各自增量同步历史会互相覆盖导致 illegal move。
        // 共用实例后棋盘由同一份 syncedMoves 连续同步，天然正确。
        const shared = createGTPEngine(1, gtpConfig.value)
        shared.setLevel(level.value)
        shared.setRules(rules.value, RULE_KOMI[rules.value])
        shared.setStyle(style.value)
        e.startEvc(g, shared, shared)
      } else {
        const black = createEngine(1)
        const white = createEngine(-1)
        e.startEvc(g, black, white)
      }
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

      <template v-if="engineType !== 'simple'">
        <label class="ctrl-label">
          <span class="label-text">棋力</span>
          <select v-model="level" @change="startGame">
            <option v-for="l in 5" :key="l" :value="l">⭐ {{ l }}（{{ ['1秒','2秒','3秒','4秒','5秒'][l-1] }}）</option>
          </select>
        </label>

        <label class="ctrl-label">
          <span class="label-text">规则</span>
          <select v-model="rules" @change="startGame">
            <option value="chinese">中国规则 贴7.5</option>
            <option value="japanese">日韩规则 贴6.5</option>
            <option value="ancient">古棋 无贴目</option>
          </select>
        </label>

        <label class="ctrl-label">
          <span class="label-text">棋风</span>
          <select v-model="style" @change="startGame">
            <option value="balanced">⚖️ 均衡</option>
            <option value="solid">🛡️ 稳健</option>
            <option value="aggressive">⚔️ 激进</option>
          </select>
        </label>
      </template>
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
      <button class="btn" @click="g.undo()" :disabled="g.state.history.length === 0 || g.mode === 'evc' || g.editing">↩ 悔棋</button>
      <button class="btn" @click="g.passTurn()" :disabled="g.state.finished || !g.isHumanTurn || g.editing">✋ 停一手</button>
      <button class="btn" @click="g.resign()" :disabled="g.state.finished || g.editing">🏳 认输</button>
      <button class="btn" @click="togglePause" :disabled="g.state.finished || g.editing">
        {{ e.paused ? '▶ 继续' : '⏸ 暂停AI' }}
      </button>
      <button class="btn" @click="g.enterEdit()" :disabled="g.state.finished || g.editing">✏️ 摆子</button>
      <button class="btn" @click="showHistory = !showHistory">🗂 历史</button>
      <button
        v-if="mode === 'pve' && g.isHumanTurn && !g.state.finished"
        class="btn btn-hint"
        @click="showHint"
        :disabled="hintLoading || g.editing"
      >
        💡 {{ hintLoading ? '分析中...' : '最佳着法' }}
      </button>
      <span v-if="engineStatusText" class="engine-status">{{ engineStatusText }}</span>
    </div>

    <!-- 摆子编辑工具条 -->
    <div v-if="g.editing" class="edit-bar">
      <span class="edit-title">✏️ 摆子模式（点击棋盘放置/移除棋子）</span>
      <button class="btn" :class="{ active: g.editColor === 1 }" @click="g.setEditColor(1)">⚫ 摆黑</button>
      <button class="btn" :class="{ active: g.editColor === -1 }" @click="g.setEditColor(-1)">⚪ 摆白</button>
      <button class="btn" @click="g.clearEdit()">🗑 清空</button>
      <button class="btn btn-primary" @click="g.exitEditAndPlay(1)">▶ 黑先下</button>
      <button class="btn btn-primary" @click="g.exitEditAndPlay(-1)">▶ 白先下</button>
      <button class="btn" @click="g.cancelEdit()">✖ 取消</button>
    </div>

    <!-- 让子棋 -->
    <div v-if="showHandicap" class="edit-bar">
      <span class="edit-title">🎯 让子棋（自动摆黑子星位，白先下）：</span>
      <button v-for="n in [2, 3, 4, 5, 6, 7, 8, 9]" :key="n" class="btn" @click="startHandicap(n)">让 {{ n }} 子</button>
      <button class="btn" @click="showHandicap = false">✖ 关闭</button>
    </div>

    <!-- 历史对局 -->
    <div v-if="showHistory" class="history-panel">
      <div class="history-head">
        <span class="edit-title">🗂 历史对局（自动保存最近 30 局）</span>
        <button class="btn btn-close" @click="showHistory = false">✕</button>
      </div>
      <div v-if="g.historyGames().length === 0" class="history-empty">暂无历史对局，下完一局后自动保存</div>
      <div
        v-for="h in g.historyGames()"
        :key="h.id"
        class="history-item"
        @click="loadHistory(h.id)"
      >
        <span class="h-time">{{ new Date(h.ts).toLocaleString() }}</span>
        <span class="h-meta">{{ h.size }} 路 · {{ h.turns }} 手 · {{ h.finished ? '已结束' : '进行中' }}</span>
        <span class="h-mode">{{ h.mode === 'evc' ? 'AI对战' : '人机' }}</span>
      </div>
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

.btn-hint {
  border-color: rgba(77,163,255,0.35);
  color: #4da3ff;
}

.btn-hint:hover:not(:disabled) {
  background: rgba(77,163,255,0.15);
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

.edit-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 14px;
  margin-top: 8px;
  background: rgba(232,193,112,0.08);
  border: 1px dashed rgba(232,193,112,0.4);
  border-radius: 8px;
}

.edit-title {
  font-size: 13px;
  color: #e8c170;
  margin-right: 6px;
}

.edit-bar .btn.active {
  background: rgba(232,193,112,0.35);
  border-color: #e8c170;
  color: #e8c170;
}

.history-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 14px;
  margin-top: 8px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 8px;
  max-height: 260px;
  overflow-y: auto;
  width: 100%;
  max-width: 460px;
}

.history-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.history-empty {
  color: #666;
  font-size: 13px;
  padding: 8px 0;
}

.history-item {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: #bbb;
  transition: all 0.15s;
  background: rgba(255,255,255,0.03);
}

.history-item:hover {
  background: rgba(232,193,112,0.12);
  color: #e8c170;
}

.h-time {
  color: #888;
  font-size: 12px;
}

.h-meta {
  flex: 1;
}

.h-mode {
  color: #4da3ff;
  font-size: 12px;
}
</style>
