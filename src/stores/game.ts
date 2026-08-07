import { defineStore } from 'pinia'
import { createBoard, isLegalMove, pass, placeStone } from '../engine/board'
import { countScore } from '../engine/rules'
import { stateToSGF, sgfToState } from '../engine/sgf'
import type { GameState, Point } from '../engine/types'
import { useEngineStore } from './engine'
import { useAnalysisStore } from './analysis'

export type GameMode = 'pve' | 'evc'

/**
 * 从历史重建局面：
 * - 摆子段（0..editBaseLen）：按记录颜色显式放置（快照还原，不轮转不提子）
 * - 后续段（editBaseLen..）：正常轮转落子（placeStone，含提子/劫）
 * 解决"摆子历史非轮转、轮转重放导致棋子颜色错乱"的问题。
 */
function rebuildState(
  size: number,
  hist: GameState['history'],
  editBaseLen: number,
  editNextColor: 1 | -1
): GameState {
  const s = createBoard(size)
  for (let k = 0; k < Math.min(editBaseLen, hist.length); k++) {
    const m = hist[k]
    if (!m.point) continue
    const i = m.point.y * s.size + m.point.x
    if (i >= 0 && i < s.stones.length && s.stones[i] === 0) s.stones[i] = m.player
  }
  s.turn = editNextColor
  for (let k = editBaseLen; k < hist.length; k++) {
    const m = hist[k]
    const s2 = m.point ? placeStone(s, m.point) : pass(s)
    s.stones = s2.stones
    s.turn = s2.turn
    s.ko = s2.ko
    s.captured = s2.captured
    s.passCount = s2.passCount
  }
  s.history = hist
  return s
}

export const useGameStore = defineStore('game', {
  state: () => ({
    size: 19 as number,
    mode: 'pve' as GameMode,
    komi: 3.75,
    state: createBoard(19) as GameState,
    humanColor: 1 as 1 | -1,
    resigner: null as 1 | -1 | null,
    cursor: 0 as number,
    // 对局代次：新局/悔棋/导入/回放截断时递增，用于丢弃旧引擎的迟到结果
    generation: 0 as number,
    // 摆子编辑模式
    editing: false,
    editColor: 1 as 1 | -1,
    editHistory: [] as { player: 1 | -1; point: Point }[],
    // 摆子段手数：历史前段（0..editBaseLen）是摆子序列（非轮转，须显式放置还原），
    // 后续着法为正常轮转对局（placeStone 重放）
    editBaseLen: 0,
    editNextColor: 1 as 1 | -1,
  }),
  getters: {
    currentPlayer(): 1 | -1 {
      return this.state.turn
    },
    isHumanTurn(): boolean {
      if (this.mode === 'evc') return false
      return this.state.turn === this.humanColor
    },
    score(): { black: number; white: number; komi: number } {
      return countScore(this.state, 'area', this.komi)
    },
    // 回放视图：按 cursor 重建局面（悔棋/跳转后棋盘只显示到游标位置）
    displayState(): GameState {
      const s = rebuildState(this.size, this.state.history.slice(0, this.cursor), this.editBaseLen, this.editNextColor)
      s.finished = this.state.finished
      return s
    },
    // 编辑视图：按摆子序列强制放置（任意颜色、不校验合法性）
    editState(): GameState {
      const s = createBoard(this.size)
      for (const m of this.editHistory) {
        if (!m.point) continue
        const i = m.point.y * s.size + m.point.x
        if (i >= 0 && i < s.stones.length && s.stones[i] === 0) {
          s.stones[i] = m.player
        }
      }
      s.history = this.editHistory as unknown as GameState['history']
      return s
    },
  },
  actions: {
    /**
     * 从历史重建局面（供 actions 内部使用，与 displayState 同一逻辑）。
     */
    rebuild(hist: GameState['history']): GameState {
      return rebuildState(this.size, hist, this.editBaseLen, this.editNextColor)
    },
    newGame(size: number, mode: GameMode, komi: number) {
      this.size = size
      this.mode = mode
      this.komi = komi
      this.state = createBoard(size)
      this.resigner = null
      this.cursor = 0
      this.generation++
      this.editBaseLen = 0
      this.editNextColor = 1
    },
    playHuman(point: Point) {
      if (this.state.finished) return
      if (this.mode === 'evc') return
      // 回放中落子：先截断历史并重建局面（stones/turn 同步到回放位置），
      // 否则棋盘状态停留在完整局，落子会与未来手冲突/颜色错误
      if (this.cursor < this.state.history.length) {
        this.generation++
        this.state = this.rebuild(this.state.history.slice(0, this.cursor))
      }
      if (!this.isHumanTurn) return
      if (!isLegalMove(this.state, point)) return
      this.state = placeStone(this.state, point)
      this.cursor = this.state.history.length
      const engine = useEngineStore()
      engine.onHumanMove(this as unknown as ReturnType<typeof useGameStore>)
    },
    playMove(move: { player: 1 | -1; point: Point | null }) {
      if (this.state.finished) return
      if (move.player !== this.state.turn) return
      if (move.point) {
        if (!isLegalMove(this.state, move.point)) return
        this.state = placeStone(this.state, move.point)
      } else {
        this.state = pass(this.state)
      }
      this.cursor = this.state.history.length
    },
    undo() {
      if (this.state.history.length === 0) return
      if (this.mode === 'evc') return
      this.generation++
      // 用重建逻辑（摆子段显式放置 + 后续轮转）而非 placeStone 全量轮转重放，
      // 否则悔掉摆子后的着法时棋子颜色会错乱
      const rebuilt = this.rebuild(this.state.history.slice(0, -1))
      rebuilt.finished = false
      this.state = rebuilt
      this.cursor = this.state.history.length
      // 悔棋后让引擎按当前轮次重新思考（pve 悔掉 AI 手后 AI 需再下）
      const engine = useEngineStore()
      engine.restartEngine(this as unknown as ReturnType<typeof useGameStore>, this.state.turn)
    },
    passTurn() {
      if (this.state.finished || !this.isHumanTurn) return
      this.state = pass(this.state)
      this.cursor = this.state.history.length
    },
    resign() {
      if (this.state.finished) return
      this.resigner = this.state.turn
      this.state = { ...this.state, finished: true }
      useEngineStore().stop()
    },
    toSGF(): string {
      return stateToSGF(this.state, this.komi)
    },
    stepBack() {
      this.cursor = Math.max(0, this.cursor - 1)
    },
    stepForward() {
      this.cursor = Math.min(this.state.history.length, this.cursor + 1)
    },
    jumpTo(n: number) {
      this.cursor = Math.max(0, Math.min(this.state.history.length, n))
    },
    importSGF(sgf: string) {
      const s = sgfToState(sgf)
      this.size = s.size
      this.mode = 'pve'
      this.humanColor = 1
      this.state = s
      this.cursor = s.history.length
      this.generation++
      this.editBaseLen = 0
      this.editNextColor = 1
      // 停止旧引擎的在途思考，清空上一局的分析残留
      useEngineStore().stop()
      useAnalysisStore().reset()
    },
    // ===== 摆子编辑模式 =====
    enterEdit() {
      if (this.state.finished) return
      this.generation++
      useEngineStore().pause()
      useAnalysisStore().reset()
      // 编辑起点 = 当前局面（到回放游标为止的全部着法，跳过 pass 手）
      this.editHistory = this.state.history
        .slice(0, this.cursor)
        .filter((m): m is { player: 1 | -1; point: Point } => !!m.point)
        .map((m) => ({ player: m.player, point: m.point }))
      this.editColor = this.state.turn
      this.editing = true
    },
    editClick(point: Point) {
      if (!this.editing) return
      const i = point.y * this.size + point.x
      if (i < 0 || i >= this.size * this.size) return
      const s = this.editState
      if (s.stones[i] !== 0) {
        // 点击已有棋子：移除该点最后一条摆子记录
        for (let k = this.editHistory.length - 1; k >= 0; k--) {
          const m = this.editHistory[k]
          if (m.point && m.point.x === point.x && m.point.y === point.y) {
            this.editHistory = [...this.editHistory.slice(0, k), ...this.editHistory.slice(k + 1)]
            return
          }
        }
      } else {
        this.editHistory = [...this.editHistory, { player: this.editColor, point }]
      }
    },
    setEditColor(c: 1 | -1) {
      this.editColor = c
    },
    clearEdit() {
      this.editHistory = []
    },
    cancelEdit() {
      this.editing = false
      this.editHistory = []
      useEngineStore().resume(this as unknown as ReturnType<typeof useGameStore>)
    },
    /**
     * 退出编辑并让指定颜色先手。
     * 编辑棋盘按摆子序列强制放置，历史即摆子序列（引擎按序 play 同步）。
     */
    exitEditAndPlay(nextColor: 1 | -1) {
      const s = this.editState
      s.turn = nextColor
      s.finished = false
      s.passCount = 0
      s.ko = null
      s.captured = { black: 0, white: 0 }
      // 记录摆子段信息：历史前段为非轮转摆子序列，须显式放置还原
      this.editBaseLen = this.editHistory.length
      this.editNextColor = nextColor
      this.state = s
      this.cursor = s.history.length
      this.editing = false
      this.editHistory = []
      this.generation++
      // 强制引擎全量重放（摆子后的棋盘与引擎不同步），restartEngine 内部解除暂停并启动思考
      useEngineStore().restartEngine(this as unknown as ReturnType<typeof useGameStore>, nextColor, true)
    },
  },
})
