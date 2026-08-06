import { defineStore } from 'pinia'
import { createBoard, isLegalMove, pass, placeStone, stateFromHistory, undo } from '../engine/board'
import { countScore } from '../engine/rules'
import { stateToSGF, sgfToState } from '../engine/sgf'
import type { GameState, Point } from '../engine/types'
import { useEngineStore } from './engine'
import { useAnalysisStore } from './analysis'

export type GameMode = 'pve' | 'evc'

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
      const s = stateFromHistory(this.state, this.state.history.slice(0, this.cursor))
      s.finished = this.state.finished
      return s
    },
  },
  actions: {
    newGame(size: number, mode: GameMode, komi: number) {
      this.size = size
      this.mode = mode
      this.komi = komi
      this.state = createBoard(size)
      this.resigner = null
      this.cursor = 0
      this.generation++
    },
    playHuman(point: Point) {
      if (this.state.finished) return
      if (this.mode === 'evc') return
      // 回放中落子：先截断历史并重建局面（stones/turn 同步到回放位置），
      // 否则棋盘状态停留在完整局，落子会与未来手冲突/颜色错误
      if (this.cursor < this.state.history.length) {
        this.generation++
        this.state = stateFromHistory(this.state, this.state.history.slice(0, this.cursor))
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
      this.state = undo(this.state)
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
      // 停止旧引擎的在途思考，清空上一局的分析残留
      useEngineStore().stop()
      useAnalysisStore().reset()
    },
  },
})
