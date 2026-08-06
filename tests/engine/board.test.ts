import { describe, it, expect } from 'vitest'
import { createBoard } from '../../src/engine/board'

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
