import type { Analysis, EngineAdapter, GameState, Move, Player } from '../types'
import { indexOf, isLegalMove, neighbors, opponent, pass, placeStone } from '../board'

function legalMoves(state: GameState): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  for (let y = 0; y < state.size; y++) {
    for (let x = 0; x < state.size; x++) {
      const p = { x, y }
      if (isLegalMove(state, p)) out.push(p)
    }
  }
  return out
}

export class SimpleAI implements EngineAdapter {
  name = 'simple-ai'
  engineType = 'simple' as const
  status: 'idle' | 'thinking' | 'error' = 'idle'
  private level = 1
  private stopped = false

  constructor(private player: Player, level = 1) {
    this.setLevel(level)
  }

  setLevel(level: number): void {
    this.level = Math.max(1, Math.min(5, level))
  }

  stop(): void {
    this.stopped = true
  }

  dispose(): void {
    this.stopped = true
  }

  private scoreMove(state: GameState, p: { x: number; y: number }): number {
    const player = state.turn
    let score = 0

    // Check if this move captures opponent stones
    const simStones = [...state.stones]
    simStones[indexOf(state, p)] = player
    for (const q of neighbors(state, p)) {
      if (simStones[indexOf(state, q)] === opponent(player)) {
        // Check if this opponent group has 0 liberties after our move
        const visited = new Set<number>()
        const queue: number[] = [indexOf(state, q)]
        visited.add(indexOf(state, q))
        let groupSize = 0
        let hasLiberty = false
        while (queue.length > 0) {
          const ci = queue.pop()!
          groupSize++
          const cx = ci % state.size
          const cy = Math.floor(ci / state.size)
          for (const nq of neighbors(state, { x: cx, y: cy })) {
            const ni = indexOf(state, nq)
            if (simStones[ni] === 0) hasLiberty = true
            else if (simStones[ni] === opponent(player) && !visited.has(ni)) {
              visited.add(ni)
              queue.push(ni)
            }
          }
        }
        if (!hasLiberty) score += groupSize * 1000 // Capture!
      }
    }

    // Check if this move puts opponent in atari (1 liberty)
    for (const q of neighbors(state, p)) {
      if (simStones[indexOf(state, q)] === opponent(player)) {
        const visited = new Set<number>()
        const queue: number[] = [indexOf(state, q)]
        visited.add(indexOf(state, q))
        const libs = new Set<number>()
        while (queue.length > 0) {
          const ci = queue.pop()!
          const cx = ci % state.size
          const cy = Math.floor(ci / state.size)
          for (const nq of neighbors(state, { x: cx, y: cy })) {
            const ni = indexOf(state, nq)
            if (simStones[ni] === 0) libs.add(ni)
            else if (simStones[ni] === opponent(player) && !visited.has(ni)) {
              visited.add(ni)
              queue.push(ni)
            }
          }
        }
        if (libs.size === 1) score += 200 // Atari
      }
    }

    // Positional: prefer center-ish
    const center = (state.size - 1) / 2
    const d = Math.abs(p.x - center) + Math.abs(p.y - center)
    score += (state.size - d) * 0.1

    // Very slight edge bonus for 3-3 and 4-4 points
    if ((p.x === 2 || p.x === state.size - 3) && (p.y === 2 || p.y === state.size - 3)) score += 2

    return score
  }

  private simulateOnce(state: GameState): number {
    let s = state
    const limit = Math.min(state.size * state.size, 50)
    for (let i = 0; i < limit && !s.finished; i++) {
      const moves = legalMoves(s)
      if (moves.length === 0) {
        s = pass(s)
      } else {
        const p = moves[Math.floor(Math.random() * moves.length)]
        s = placeStone(s, p)
      }
    }
    let black = 0, white = 0
    for (const c of s.stones) {
      if (c === 1) black++
      else if (c === -1) white++
    }
    return this.player === 1 ? black - white : white - black
  }

  async genmove(state: GameState): Promise<Move> {
    this.status = 'thinking'
    this.stopped = false
    const moves = legalMoves(state)
    if (moves.length === 0) {
      this.status = 'idle'
      return { player: state.turn, point: null }
    }

    // Level determines sim count: 3/6/9/12/15
    const sims = Math.max(1, this.level * 3)

    let best = moves[0]
    let bestScore = -Infinity

    for (const p of moves) {
      if (this.stopped) break
      const next = placeStone(state, p)
      let total = 0
      for (let i = 0; i < sims; i++) total += this.simulateOnce(next)
      const score = this.scoreMove(state, p) + total / Math.max(1, sims)
      if (score > bestScore) {
        bestScore = score
        best = p
      }
    }
    this.status = 'idle'
    return { player: state.turn, point: best }
  }

  async analyze(state: GameState): Promise<Analysis> {
    const move = await this.genmove(state)
    const next = move.point ? placeStone(state, move.point) : pass(state)
    let win = 0
    const sims = 20
    for (let i = 0; i < sims; i++) {
      if (this.simulateOnce(next) > 0) win++
    }
    const winRate = win / sims
    return {
      score: winRate * 2 - 1,
      winRate,
      bestMove: move,
      variations: [move.point ? [move] : []],
    }
  }
}

export function createSimpleAI(player: Player): EngineAdapter {
  return new SimpleAI(player)
}
