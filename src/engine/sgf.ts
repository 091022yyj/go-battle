import type { GameState } from './types'
import { createBoard, placeStone, pass } from './board'

const COLS = 'abcdefghijklmnopqrstuvwxyz'

export function pointToSGF(p: { x: number; y: number }): string {
  return COLS[p.x] + COLS[p.y]
}

export function sgfToPoint(s: string): { x: number; y: number } {
  return { x: COLS.indexOf(s[0]), y: COLS.indexOf(s[1]) }
}

export function stateToSGF(state: GameState, komi = 3.75): string {
  const moves = state.history
    .map((m) => `${m.player === 1 ? 'B' : 'W'}[${m.point ? pointToSGF(m.point) : ''}]`)
    .join('')
  return `(;GM[1]FF[4]SZ[${state.size}]KM[${komi}]${moves})`
}

export function sgfToState(sgf: string): GameState {
  const szMatch = sgf.match(/SZ\[(\d+)\]/)
  const size = szMatch ? parseInt(szMatch[1], 10) : 19
  let state = createBoard(size)
  const moveRe = /([BW])\[([a-z]{0,2})\]/g
  let m: RegExpExecArray | null
  while ((m = moveRe.exec(sgf))) {
    const color = m[1] === 'B' ? 1 : -1
    const p = m[2]
    if (p.length === 0 || p === 'tt') {
      state = pass(state)
    } else {
      const point = sgfToPoint(p)
      if (state.turn !== color) state = pass(state)
      state = placeStone(state, point)
    }
  }
  return state
}
