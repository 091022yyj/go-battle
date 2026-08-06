import type { Color, GameState, ScoreResult } from './types'
import { indexOf, neighbors } from './board'

export function areaOf(state: GameState): Color[] {
  const owners = new Array<Color>(state.size * state.size).fill(0)
  const visited = new Set<number>()
  for (let i = 0; i < state.stones.length; i++) {
    if (visited.has(i)) continue
    if (state.stones[i] !== 0) {
      visited.add(i)
      continue
    }
    const queue = [i]
    visited.add(i)
    const region: number[] = []
    let black = false
    let white = false
    while (queue.length > 0) {
      const cur = queue.pop()!
      region.push(cur)
      for (const q of neighbors(state, { x: cur % state.size, y: Math.floor(cur / state.size) })) {
        const j = indexOf(state, q)
        const c = state.stones[j]
        if (c === 1) black = true
        else if (c === -1) white = true
        else if (!visited.has(j)) {
          visited.add(j)
          queue.push(j)
        }
      }
    }
    const owner: Color = black && !white ? 1 : white && !black ? -1 : 0
    for (const k of region) owners[k] = owner
  }
  return owners
}

export function countScore(state: GameState, method: 'area' | 'territory' = 'area', komi = 3.75): ScoreResult {
  const owners = areaOf(state)
  let black = 0
  let white = 0
  let blackStones = 0
  let whiteStones = 0
  for (let i = 0; i < state.stones.length; i++) {
    if (state.stones[i] === 1) {
      black++
      blackStones++
    } else if (state.stones[i] === -1) {
      white++
      whiteStones++
    } else if (owners[i] === 1) black++
    else if (owners[i] === -1) white++
  }
  if (method === 'territory') {
    // 日韩计目：领地 = 区域分 - 己方棋子数；再加己方提子数、减被对方提子数
    // （captured.black = 黑方提的子数，captured.white = 白方提的子数）
    const k = komi === 3.75 ? 6.5 : komi
    black = black - blackStones + state.captured.black - state.captured.white
    white = white - whiteStones + state.captured.white - state.captured.black
    return { black, white, komi: k, method }
  }
  return { black, white, komi, method }
}

export function winner(state: GameState, method: 'area' | 'territory' = 'area', komi = 3.75): number {
  const r = countScore(state, method, komi)
  if (r.black - r.white > r.komi) return 1
  if (r.white - r.black > r.komi) return -1
  return 0
}
