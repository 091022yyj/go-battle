import { defineStore } from 'pinia'
import { createBoard, isLegalMove, pass, placeStone, undo } from '../engine/board'
import { countScore } from '../engine/rules'
import { stateToSGF } from '../engine/sgf'
import type { GameState, Point } from '../engine/types'

export type GameMode = 'pvp' | 'pve' | 'evc'

export const useGameStore = defineStore('game', {
  state: () => ({
    size: 19 as number,
    mode: 'pvp' as GameMode,
    komi: 3.75,
    state: createBoard(19) as GameState,
    humanColor: 1 as 1 | -1,
    resigner: null as 1 | -1 | null,
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
  },
  actions: {
    newGame(size: number, mode: GameMode, komi: number) {
      this.size = size
      this.mode = mode
      this.komi = komi
      this.state = createBoard(size)
      this.resigner = null
    },
    playHuman(point: Point) {
      if (this.state.finished) return
      if (!this.isHumanTurn) return
      if (!isLegalMove(this.state, point)) return
      this.state = placeStone(this.state, point)
    },
    playMove(move: { player: 1 | -1; point: Point | null }) {
      if (this.state.finished) return
      if (move.point) {
        if (!isLegalMove(this.state, move.point)) return
        this.state = placeStone(this.state, move.point)
      } else {
        this.state = pass(this.state)
      }
    },
    undo() {
      if (this.state.history.length === 0) return
      this.state = undo(this.state)
    },
    passTurn() {
      if (this.state.finished || !this.isHumanTurn) return
      this.state = pass(this.state)
    },
    resign() {
      if (this.state.finished) return
      this.resigner = this.state.turn
      this.state = { ...this.state, finished: true }
    },
    toSGF(): string {
      return stateToSGF(this.state, this.komi)
    },
  },
})
