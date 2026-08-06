import { defineStore } from 'pinia'
import { createBoard, isLegalMove, pass, placeStone, undo } from '../engine/board'
import { countScore } from '../engine/rules'
import { stateToSGF, sgfToState } from '../engine/sgf'
import type { GameState, Point } from '../engine/types'
import { useEngineStore } from './engine'

export type GameMode = 'pvp' | 'pve' | 'evc'

export const useGameStore = defineStore('game', {
  state: () => ({
    size: 19 as number,
    mode: 'pvp' as GameMode,
    komi: 3.75,
    state: createBoard(19) as GameState,
    humanColor: 1 as 1 | -1,
    resigner: null as 1 | -1 | null,
    cursor: 0 as number,
  }),
  getters: {
    currentPlayer(): 1 | -1 {
      return this.state.turn
    },
    isHumanTurn(): boolean {
      if (this.mode === 'pvp') return true
      if (this.mode === 'evc') return false
      return this.state.turn === this.humanColor
    },
    score(): { black: number; white: number; komi: number } {
      return countScore(this.state, 'area', this.komi)
    },
    displayState(): GameState {
      const s = createBoard(this.size)
      const limit = Math.min(this.cursor, this.state.history.length)
      for (let k = 0; k < limit; k++) {
        const m = this.state.history[k]
        s.history.push(m)
        if (m.point) {
          const next = placeStone(s, m.point)
          s.stones = next.stones
          s.turn = next.turn
          s.ko = next.ko
          s.captured = next.captured
          s.passCount = next.passCount
        } else {
          s.passCount += 1
          s.turn = s.turn === 1 ? -1 : 1
        }
      }
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
    },
    playHuman(point: Point) {
      if (this.state.finished) return
      if (!this.isHumanTurn) return
      if (!isLegalMove(this.state, point)) return
      if (this.cursor < this.state.history.length) {
        this.state = { ...this.state, history: this.state.history.slice(0, this.cursor) }
      }
      this.state = placeStone(this.state, point)
      this.cursor = this.state.history.length
      const engine = useEngineStore()
      engine.onHumanMove(this as unknown as ReturnType<typeof useGameStore>)
    },
    playMove(move: { player: 1 | -1; point: Point | null }) {
      if (this.state.finished) return
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
      this.state = undo(this.state)
      this.cursor = this.state.history.length
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
      this.mode = 'pvp'
      this.state = s
      this.cursor = s.history.length
    },
  },
})
