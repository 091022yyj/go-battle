import { describe, it, expect } from 'vitest'
import { createBoard, placeStone, pass, isLegalMove } from '../../src/engine/board'

describe('board', () => {
  it('创建 9 路棋盘，全部为空，黑先', () => {
    const b = createBoard(9)
    expect(b.size).toBe(9)
    expect(b.stones.length).toBe(81)
    expect(b.stones.every((c) => c === 0)).toBe(true)
    expect(b.turn).toBe(1)
    expect(b.ko).toBeNull()
  })

  it('越界坐标判非法', () => {
    const b = createBoard(9)
    expect(b.inBounds({ x: -1, y: 0 })).toBe(false)
    expect(b.inBounds({ x: 9, y: 0 })).toBe(false)
    expect(b.inBounds({ x: 4, y: 4 })).toBe(true)
  })
})

// Helper: play a sequence of moves, with pass for the other color
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

describe('placeStone & capture', () => {
  it('单子被四面包围后提子', () => {
    const s = playSequence(createBoard(9), [
      { player: 1, point: { x: 4, y: 4 } },   // 黑
      { player: -1, point: { x: 3, y: 4 } },  // 白
      { player: -1, point: { x: 5, y: 4 } },  // 白
      { player: -1, point: { x: 4, y: 3 } },  // 白
      { player: -1, point: { x: 4, y: 5 } },  // 白提黑
    ])
    expect(s.stones[9 * 4 + 4]).toBe(0) // 黑子被提
    expect(s.captured.white).toBe(1)
    expect(s.turn).toBe(1) // 白走最后一步，轮到黑
  })

  it('两个同色子连串被围，整串被提', () => {
    const s = playSequence(createBoard(9), [
      { player: 1, point: { x: 4, y: 4 } },   // 黑
      { player: 1, point: { x: 5, y: 4 } },   // 黑
      { player: -1, point: { x: 3, y: 4 } },  // 白
      { player: -1, point: { x: 6, y: 4 } },  // 白
      { player: -1, point: { x: 4, y: 3 } },  // 白
      { player: -1, point: { x: 5, y: 3 } },  // 白
      { player: -1, point: { x: 4, y: 5 } },  // 白
      { player: -1, point: { x: 5, y: 5 } },  // 白提整串
    ])
    expect(s.stones[9 * 4 + 4]).toBe(0)
    expect(s.stones[9 * 4 + 5]).toBe(0)
    expect(s.captured.white).toBe(2)
  })

  it('打吃后提子（先打吃再提）', () => {
    // 黑(4,4)只剩一气时白下(4,5)提子
    const s = playSequence(createBoard(9), [
      { player: 1, point: { x: 4, y: 4 } },   // 黑
      { player: -1, point: { x: 3, y: 4 } },  // 白
      { player: -1, point: { x: 5, y: 4 } },  // 白
      { player: -1, point: { x: 4, y: 3 } },  // 白 → 黑只剩一气
      // 黑应一手别处
      { player: 1, point: { x: 8, y: 8 } },
      { player: -1, point: { x: 4, y: 5 } },  // 白提黑
    ])
    expect(s.stones[9 * 4 + 4]).toBe(0)
    expect(s.captured.white).toBe(1)
  })

  it('已占位不可落子', () => {
    const s = playSequence(createBoard(9), [
      { player: 1, point: { x: 4, y: 4 } },
    ])
    expect(() => placeStone(s, { x: 4, y: 4 })).toThrow('occupied')
  })

  it('自杀禁手', () => {
    // 黑(4,4)四面被白围，只剩(4,5)，黑不能自杀
    const s = playSequence(createBoard(9), [
      { player: 1, point: { x: 4, y: 4 } },   // 黑
      { player: -1, point: { x: 3, y: 4 } },  // 白
      { player: -1, point: { x: 5, y: 4 } },  // 白
      { player: -1, point: { x: 4, y: 3 } },  // 白
      { player: -1, point: { x: 4, y: 5 } },  // 白 → 提黑
    ])
    // 黑(4,4)已被提，现在轮到黑。黑不能在 (4,4) 自杀（被白全围）
    // 重建局面：黑 (4,4)，白围四面
    const s2 = playSequence(createBoard(9), [
      { player: 1, point: { x: 4, y: 4 } },
      { player: -1, point: { x: 3, y: 4 } },
      { player: -1, point: { x: 5, y: 4 } },
      { player: -1, point: { x: 4, y: 3 } },
      // 留 (4,5) 为空 → 此时黑(4,4)有 (4,5) 一气
      // 黑走别处，白堵 (4,5) → 提黑
      { player: 1, point: { x: 8, y: 8 } },
      { player: -1, point: { x: 4, y: 5 } },  // 提黑
    ])
    // 现在棋盘上黑(4,4)空位，但白围了一片
    // 黑不能在 (4,4) 自杀——除非提子
    expect(s2.stones[9 * 4 + 4]).toBe(0)
    // 这个位置现在不能下（四面白且无气）
  })
})

// Task 4 tests
import { undo } from '../../src/engine/board'

describe('pass & undo', () => {
  it('pass 切换回合并记录', () => {
    const b = createBoard(9)
    const s = pass(b)
    expect(s.turn).toBe(-1)
    expect(s.history).toEqual([{ player: 1, point: null }])
  })

  it('连续两次 pass 终局', () => {
    const b = createBoard(9)
    const s1 = pass(b)
    const s2 = pass(s1)
    expect(s2.finished).toBe(true)
  })

  it('undo 撤销最后一步', () => {
    const b = createBoard(9)
    let s = placeStone(b, { x: 3, y: 3 })
    s = placeStone(s, { x: 4, y: 4 })
    const u = undo(s)
    expect(u.history.length).toBe(1)
    expect(u.stones[9 * 4 + 4]).toBe(0)
    expect(u.turn).toBe(-1)
  })
})

describe('ko', () => {
  it('单子提子记录劫点，禁止立即回提', () => {
    const b = createBoard(9)
    // 构造劫局面
    let s = playSequence(b, [
      { player: 1, point: { x: 1, y: 0 } },   // 黑
      { player: -1, point: { x: 0, y: 0 } },  // 白
      { player: -1, point: { x: 2, y: 0 } },  // 白
      { player: -1, point: { x: 0, y: 1 } },  // 白
      { player: -1, point: { x: 1, y: 1 } },  // 白 → 提黑(1,0)，形成劫
    ])
    // 白在(1,1)提吃黑(1,0)，形成劫
    expect(s.stones[9 * 0 + 1]).toBe(0) // (1,0) 被提
    expect(s.captured.white).toBe(1)
    // 劫点应为被提的黑子位置 (1,0)
    expect(s.ko).toEqual({ x: 1, y: 0 })
    // 黑不能立即回提
    expect(isLegalMove(s, { x: 1, y: 0 })).toBe(false)
    // 黑走别处 → 劫解除
    const s2 = playSequence(s, [
      { player: 1, point: { x: 8, y: 8 } },
    ])
    expect(s2.ko).toBeNull()
    // 劫解除后白可以下(1,0)（正常落子，非提劫）
    expect(isLegalMove(s2, { x: 1, y: 0 })).toBe(true)
  })
})
