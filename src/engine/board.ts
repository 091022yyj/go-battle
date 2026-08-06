import type { Color, GameState, Move, Player, Point } from './types'

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

export function createBoard(size: number): GameState {
  const state: GameState = {
    size,
    stones: new Array(size * size).fill(0) as Color[],
    turn: 1,
    ko: null,
    captured: { black: 0, white: 0 },
    history: [],
    passCount: 0,
    finished: false,
    inBounds(p: Point): boolean {
      return p.x >= 0 && p.x < this.size && p.y >= 0 && p.y < this.size
    },
  }
  return state
}

export function indexOf(state: GameState, p: Point): number {
  return p.y * state.size + p.x
}

export function inBounds(state: GameState, p: Point): boolean {
  return p.x >= 0 && p.x < state.size && p.y >= 0 && p.y < state.size
}

export function neighbors(state: GameState, p: Point): Point[] {
  const out: Point[] = []
  for (const [dx, dy] of NEIGHBORS) {
    const q = { x: p.x + dx, y: p.y + dy }
    if (inBounds(state, q)) out.push(q)
  }
  return out
}

export function getGroup(state: GameState, p: Point): Point[] {
  const color = state.stones[indexOf(state, p)]
  if (color === 0) return []
  const seen = new Set<number>()
  const queue: Point[] = [p]
  seen.add(indexOf(state, p))
  const group: Point[] = []
  while (queue.length > 0) {
    const cur = queue.pop()!
    group.push(cur)
    for (const q of neighbors(state, cur)) {
      const i = indexOf(state, q)
      if (!seen.has(i) && state.stones[i] === color) {
        seen.add(i)
        queue.push(q)
      }
    }
  }
  return group
}

export function getLiberties(state: GameState, group: Point[]): Set<number> {
  const libs = new Set<number>()
  for (const p of group) {
    for (const q of neighbors(state, p)) {
      if (state.stones[indexOf(state, q)] === 0) libs.add(indexOf(state, q))
    }
  }
  return libs
}

export function opponent(player: Player): Player {
  return player === 1 ? -1 : 1
}
