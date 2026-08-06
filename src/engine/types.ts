export type Color = 0 | 1 | -1
export type Player = 1 | -1

export interface Point {
  x: number
  y: number
}

export interface Move {
  player: Player
  point: Point | null
}

export interface ScoreResult {
  black: number
  white: number
  komi: number
  method: 'area' | 'territory'
}

export interface GameState {
  size: number
  stones: Color[]
  turn: Player
  ko: Point | null
  captured: { black: number; white: number }
  history: Move[]
  passCount: number
  finished: boolean
  inBounds(p: Point): boolean
}

export interface Analysis {
  score: number
  winRate: number
  bestMove: Move
  variations: Move[][]
}
