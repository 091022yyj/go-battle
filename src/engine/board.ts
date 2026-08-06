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

export function placeStone(state: GameState, point: Point): GameState {
  if (state.finished) throw new Error('game over')
  if (!state.inBounds(point)) throw new Error('out of bounds')
  const i = indexOf(state, point)
  if (state.stones[i] !== 0) throw new Error('occupied')
  if (!isLegalMove(state, point)) throw new Error('illegal move')

  const player = state.turn
  const stones = [...state.stones]
  const captured = { ...state.captured }
  let ko: Point | null = null

  stones[i] = player

  const removed: Point[] = []
  for (const q of neighbors(state, point)) {
    if (stones[indexOf(state, q)] === opponent(player)) {
      const group = getGroup({ ...state, stones }, q)
      if (getLiberties({ ...state, stones }, group).size === 0) {
        for (const g of group) {
          stones[indexOf(state, g)] = 0
          removed.push(g)
        }
      }
    }
  }

  const ownGroup = getGroup({ ...state, stones }, point)
  if (getLiberties({ ...state, stones }, ownGroup).size === 0) {
    throw new Error('suicide')
  }

  if (removed.length === 1) {
    const victim = removed[0]
    const before = state.stones
    const after = stones
    let identical = true
    for (let k = 0; k < before.length; k++) {
      if (k === i || k === indexOf(state, victim)) continue
      if (before[k] !== after[k]) {
        identical = false
        break
      }
    }
    if (identical) ko = victim
  }

  if (player === 1) captured.black += removed.length
  else captured.white += removed.length

  const next: GameState = {
    size: state.size,
    stones,
    turn: opponent(player),
    ko,
    captured,
    history: [...state.history, { player, point }],
    passCount: 0,
    finished: false,
    inBounds: state.inBounds,
  }

  return next
}

export function isLegalMove(state: GameState, point: Point): boolean {
  if (state.finished) return false
  if (!state.inBounds(point)) return false
  const i = indexOf(state, point)
  if (state.stones[i] !== 0) return false
  if (state.ko && state.ko.x === point.x && state.ko.y === point.y) return false

  const player = state.turn
  const stones = [...state.stones]
  stones[i] = player

  let captures = false
  for (const q of neighbors(state, point)) {
    if (stones[indexOf(state, q)] === opponent(player)) {
      const group = getGroup({ ...state, stones }, q)
      if (getLiberties({ ...state, stones }, group).size === 0) captures = true
    }
  }
  if (captures) return true

  const ownGroup = getGroup({ ...state, stones }, point)
  return getLiberties({ ...state, stones }, ownGroup).size > 0
}

export function pass(state: GameState): GameState {
  if (state.finished) throw new Error('game over')
  const player = state.turn
  const passCount = state.passCount + 1
  const finished = passCount >= 2
  return {
    ...state,
    turn: opponent(player),
    ko: null,
    history: [...state.history, { player, point: null }],
    passCount,
    finished,
    inBounds: state.inBounds,
  }
}

export function undo(state: GameState): GameState {
  if (state.history.length === 0) return state
  const next = createBoard(state.size)
  for (let k = 0; k < state.history.length - 1; k++) {
    const m = state.history[k]
    const s2 = m.point ? placeStone(next, m.point) : pass(next)
    next.stones = s2.stones
    next.turn = s2.turn
    next.ko = s2.ko
    next.captured = s2.captured
    next.passCount = s2.passCount
  }
  next.history = state.history.slice(0, -1)
  next.passCount = 0
  return next
}
