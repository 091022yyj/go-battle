import { defineStore } from 'pinia'
import { shallowRef, ref } from 'vue'
import type { EngineAdapter, Move } from '../engine/types'
import type { useGameStore } from './game'
import { useAnalysisStore } from './analysis'

type GameStore = ReturnType<typeof useGameStore>

/**
 * Engine manager store.
 *
 * 使用 shallowRef 保存引擎实例（而非 Pinia 深度响应式 state）：
 * 引擎类内部使用 # 私有字段，被 reactive Proxy 包裹会导致
 * "can't set private field" 错误。
 */
export const useEngineStore = defineStore('engine', () => {
  const black = shallowRef<EngineAdapter | null>(null)
  const white = shallowRef<EngineAdapter | null>(null)
  const active = shallowRef<EngineAdapter | null>(null)
  const errorMessage = ref<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null
  // 引擎未就绪/连接失败自动重试计数（引擎启动预热约 40 秒）
  let retryCount = 0

  async function startEvc(g: GameStore, blackEngine: EngineAdapter, whiteEngine: EngineAdapter) {
    cleanup()
    errorMessage.value = null
    retryCount = 0
    black.value = blackEngine
    white.value = whiteEngine
    await tick(g)
  }

  async function startPve(g: GameStore, ai: EngineAdapter) {
    cleanup()
    errorMessage.value = null
    retryCount = 0
    if (g.humanColor === 1) white.value = ai
    else black.value = ai
    await tick(g)
  }

  async function tick(g: GameStore) {
    if (g.state.finished) return
    const engine = g.state.turn === 1 ? black.value : white.value
    active.value = engine
    if (!engine) return
    // 代次快照：await 期间若发生新局/悔棋/导入，丢弃本轮的迟到结果
    const gen = g.generation

    timer = setTimeout(async () => {
      if (g.state.finished) return
      try {
        let move: Move
        const analysisStore = useAnalysisStore()

        // 支持实时分析的引擎：kata-analyze 边思考边推送候选/胜率/目差
        const liveEngine = engine as unknown as {
          genmoveLive?: (
            s: GameStore['state'],
            onUpdate?: (cands: { point: { x: number; y: number } | null; winRate: number; scoreLead: number }[]) => void
          ) => Promise<Move>
        }

        if (typeof liveEngine.genmoveLive === 'function') {
          let lastMoveNum = -1
          analysisStore.setRunning(true)
          move = await liveEngine.genmoveLive(g.state, (cands) => {
            // 候选点实时刷新（每行 info 都更新，保持棋盘动态）
            analysisStore.setCandidates(cands as never)
            // 胜率/目差/曲线按"手数"去重——同一手只取最优快照，
            // 避免流式每行都 push 导致曲线点爆炸
            const moveNum = g.state.history.length + 1
            if (cands.length > 0 && moveNum !== lastMoveNum) {
              lastMoveNum = moveNum
              const best = cands[0]
              analysisStore.setAnalysis(
                {
                  score: best.scoreLead,
                  winRate: best.winRate,
                  bestMove: { player: g.state.turn, point: best.point },
                  variations: best.point ? [[{ player: g.state.turn, point: best.point }]] : [],
                  candidates: cands as never,
                },
                moveNum
              )
            }
          })
          analysisStore.setRunning(false)
        } else {
          // 普通引擎：genmove
          const movePromise = engine.genmove(g.state)
          movePromise.catch(() => {}) // 竞态超时下的 rejection 不产生 unhandled 警告
          const timeoutPromise = new Promise<Move>((_, reject) =>
            setTimeout(() => reject(new Error('引擎思考超时（30秒）')), 30000)
          )
          move = await Promise.race([movePromise, timeoutPromise])
        }

        // 代次校验：期间发生新局/悔棋/导入则丢弃
        if (gen !== g.generation) return
        if (g.state.turn !== move.player) return
        retryCount = 0 // 思考成功，重置重试计数
        g.playMove(move)
        analysisStore.clearCandidates()
        await tick(g)
      } catch (err) {
        engine.status = 'error'
        errorMessage.value = (err as Error).message || '引擎异常'
        // Pause EVC mode if an engine fails
        if (g.mode === 'evc') {
          active.value = null
        }
        // 引擎未就绪/连接失败：自动重试（覆盖启动预热窗口），
        // 避免页面打开时引擎还在预热就报错并一直残留
        const msg = (err as Error).message || ''
        if (retryCount < 8 && /未就绪|连接引擎超时|not ready|not responding|failed to connect|connection closed/i.test(msg)) {
          retryCount++
          errorMessage.value = `引擎未就绪（${retryCount}/8），自动重试中...`
          timer = setTimeout(() => {
            tick(g)
          }, 5000)
        }
      }
    }, 20)
  }

  function onHumanMove(g: GameStore) {
    if (g.mode === 'evc') return
    if (g.mode === 'pve' && g.state.turn !== g.humanColor) tick(g)
  }

  function restartEngine(g: GameStore, color: 1 | -1) {
    errorMessage.value = null
    const engine = color === 1 ? black.value : white.value
    if (engine) {
      engine.status = 'idle'
    }
    if (g.state.turn === color) tick(g)
  }

  function stop() {
    cleanup()
  }

  function cleanup() {
    if (timer) clearTimeout(timer)
    timer = null
    black.value?.dispose()
    white.value?.dispose()
    black.value = null
    white.value = null
    active.value = null
  }

  return {
    black,
    white,
    active,
    errorMessage,
    startEvc,
    startPve,
    tick,
    onHumanMove,
    restartEngine,
    stop,
    cleanup,
  }
})
