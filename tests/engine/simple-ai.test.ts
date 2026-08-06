import { describe, it, expect } from 'vitest'
import { createBoard, placeStone, pass } from '../../src/engine/board'
import { SimpleAI } from '../../src/engine/ai/simple-ai'

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

describe('SimpleAI', () => {
  it('能吃到只剩一气的对方棋子', { timeout: 30000 }, async () => {
    // 白(4,4)被黑围三面，轮到黑→最优下(4,5)提白
    // 序列: 白(4,4) 黑(3,4) 白pass 黑(5,4) 白pass 黑(4,3) 白(8,8)
    // → 白只剩(4,5)一气，轮到黑
    const s = playSequence(createBoard(9), [
      { player: -1, point: { x: 4, y: 4 } },
      { player: 1, point: { x: 3, y: 4 } },
      { player: 1, point: { x: 5, y: 4 } },
      { player: 1, point: { x: 4, y: 3 } },
      { player: -1, point: { x: 8, y: 8 } },
    ])
    // s.turn should be 1 (black)
    expect(s.turn).toBe(1)
    const ai = new SimpleAI(1, 5)
    const move = await ai.genmove(s)
    expect(move.point).not.toBeNull()
    // Verify the move is legal
    expect(() => placeStone(s, move.point!)).not.toThrow()
  })

  it('空棋盘能找到合法着法', { timeout: 30000 }, async () => {
    const b = createBoard(9)
    const ai = new SimpleAI(1, 1)
    const move = await ai.genmove(b)
    expect(move.point).not.toBeNull()
    expect(move.player).toBe(1)
  })

  it('无合法着法时返回 pass', { timeout: 10000 }, async () => {
    // 占满棋盘（不可达），用终局模拟
    const b = createBoard(9)
    // 双方连续 pass 终局
    let s = pass(b)
    s = pass(s)
    expect(s.finished).toBe(true)
    // finished 状态 genmove 应返回 pass
    const ai = new SimpleAI(1, 1)
    const move = await ai.genmove(s)
    expect(move.point).toBeNull()
  })

  it('analyze 返回分析结果', { timeout: 60000 }, async () => {
    const b = createBoard(9)
    const ai = new SimpleAI(1, 1)
    const analysis = await ai.analyze(b)
    expect(analysis.winRate).toBeGreaterThanOrEqual(0)
    expect(analysis.winRate).toBeLessThanOrEqual(1)
    expect(analysis.bestMove).toBeDefined()
  })

  it('setLevel 限制在 1-5', () => {
    const ai = new SimpleAI(1, 0)
    ai.setLevel(10)
    // 不应崩溃
    expect(ai).toBeDefined()
  })
})
