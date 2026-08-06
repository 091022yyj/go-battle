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

  async function startEvc(g: GameStore, blackEngine: EngineAdapter, whiteEngine: EngineAdapter) {
    cleanup()
    errorMessage.value = null
    black.value = blackEngine
    white.value = whiteEngine
    await tick(g)
  }

  async function startPve(g: GameStore, ai: EngineAdapter) {
    cleanup()
    errorMessage.value = null
    if (g.humanColor === 1) white.value = ai
    else black.value = ai
    await tick(g)
  }

  async function tick(g: GameStore) {
    if (g.state.finished) return
    const engine = g.state.turn === 1 ? black.value : white.value
    active.value = engine
    if (!engine) return

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
          move = await liveEngine.genmoveLive(g.state, (cands) => {
            // 实时更新棋盘候选点 + 分析面板（胜率/目差）
            analysisStore.setCandidates(cands as never)
            if (cands.length > 0) {
              const best = cands[0]
              analysisStore.setAnalysis(
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
          })
        } else {
          // 普通引擎：genmove
          const movePromise = engine.genmove(g.state)
          const timeoutPromise = new Promise<Move>((_, reject) =>
            setTimeout(() => reject(new Error('引擎思考超时（30秒）')), 30000)
          )
          move = await Promise.race([movePromise, timeoutPromise])
        }

        if (g.state.turn !== move.player) return
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
