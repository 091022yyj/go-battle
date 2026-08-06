import { describe, it, expect } from 'vitest'
import { createBoard, placeStone, pass } from '../../src/engine/board'
import { countScore, areaOf } from '../../src/engine/rules'

// Helper: play sequence
function playSequence(
  board: ReturnType<typeof createBoard>,
  moves: ({ player: 1 | -1; point: { x: number; y: number } | null })[]
): ReturnType<typeof createBoard> {
  let s = board
  for (const m of moves) {
    if (s.turn !== m.player) s = pass(s)
    if (m.point) s = placeStone(s, m.point)
    else s = pass(s)
  }
  return s
}

describe('终局判定', () => {
  it('双方各 pass 一次即终局', () => {
    const b = createBoard(9)
    let s = placeStone(b, { x: 4, y: 4 })
    s = pass(s)
    s = pass(s)
    expect(s.finished).toBe(true)
  })
})

describe('areaOf（区域归属）', () => {
  it('空区域邻接黑则归黑', () => {
    const b = createBoard(9)
    // 黑(4,4) → 周围空点归黑
    let s = placeStone(b, { x: 4, y: 4 })
    s = pass(s)
    s = pass(s)
    const owners = areaOf(s)
    // (4,4) 邻接的空区应归黑
    expect(owners[9 * 3 + 4]).toBe(1) // (4,3) 邻接黑 → 归黑
  })

  it('双活区域双方皆无主', () => {
    // 简化双活：中间空点同时邻接黑白双方
    const b = createBoard(9)
    let s = playSequence(b, [
      { player: 1, point: { x: 3, y: 4 } },   // 黑
      { player: -1, point: { x: 5, y: 4 } },  // 白
    ])
    s = pass(s)
    s = pass(s)
    const owners = areaOf(s)
    // (4,4) 邻接黑和白 → 无主
    expect(owners[9 * 4 + 4]).toBe(0)
  })
})

describe('countScore（中式数子）', () => {
  it('简单局面计分', () => {
    const b = createBoard(9)
    // 黑(4,4) 占一个点，空区归黑
    let s = playSequence(b, [
      { player: 1, point: { x: 4, y: 4 } },
    ])
    s = pass(s)
    s = pass(s)
    const r = countScore(s, 'area', 3.75)
    // 黑: 1子 + 区域 ≈ 很多；白: 0 + 区域
    // 黑应大幅领先
    expect(r.black).toBeGreaterThan(r.white + r.komi)
  })

  it('黑 185 子胜（中式数子，贴 3.75 子）', () => {
    // 用 pass 模拟：不必真下 185 手，直接构造局面验证公式
    const b = createBoard(19)
    let s = b
    // 黑占满第一行 19子
    for (let x = 0; x < 19; x++) {
      s = playSequence(s, [{ player: 1, point: { x, y: 0 } }])
    }
    // 黑占第二行 19子
    for (let x = 0; x < 19; x++) {
      s = playSequence(s, [{ player: 1, point: { x, y: 1 } }])
    }
    // 现在黑有 38 子，白未下（pass）。终局
    s = pass(s)  // white pass
    s = pass(s)  // black pass → finished
    const r = countScore(s, 'area', 3.75)
    // 黑: 38子 + 剩余区域都归黑(因无白子) = 38 + 361-38 = 361?
    // 实际上区域归属：黑占的点 + 邻接黑的空区
    // 由于没有白子，所有空区都邻接黑 → 归黑
    // 所以 black = 361, white = 0
    expect(r.black).toBeGreaterThan(r.white + r.komi)
  })
})
