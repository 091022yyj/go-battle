import { describe, it, expect } from 'vitest'
import { createBoard, pass, placeStone, undo, stateFromHistory } from '../../src/engine/board'
import { countScore } from '../../src/engine/rules'
import { sgfToState } from '../../src/engine/sgf'

describe('bugfix: undo 保留 passCount（终局判定）', () => {
  it('悔棋不应丢失历史 pass 记录', () => {
    let s = createBoard(9)
    s = pass(s)                    // 黑 pass，passCount=1
    s = pass(s)                    // 白 pass，passCount=2 → 终局
    expect(s.finished).toBe(true)
    const u = undo(s)              // 悔掉白 pass
    expect(u.finished).toBe(false)
    expect(u.passCount).toBe(1)    // 黑 pass 应保留
    expect(u.turn).toBe(-1)        // 轮到白
    // 白再 pass 即终局（passCount=2）
    const again = pass(u)
    expect(again.finished).toBe(true)
  })
})

describe('bugfix: territory（日韩）计分方向', () => {
  it('黑得分 = 领地 + 白被提子', () => {
    let s = createBoard(9)
    s = placeStone(s, { x: 0, y: 1 })  // 黑
    s = placeStone(s, { x: 0, y: 0 })  // 白（角上单子，1 口气）
    s = placeStone(s, { x: 1, y: 0 })  // 黑提白
    expect(s.captured.black).toBe(1)   // 黑提了 1 个白子
    const r = countScore(s, 'territory', 6.5)
    const rArea = countScore(s, 'area', 6.5)
    // territory 黑分 = 黑领地(含空位) + 黑提子数 - 白提黑子数 = (area分 - 黑子数) + captured.black - captured.white
    const blackTerritory = rArea.black - 2 + s.captured.black - s.captured.white
    expect(r.black).toBe(blackTerritory)
    expect(r.black).toBeGreaterThan(r.white)
  })
})

describe('bugfix: stateFromHistory / 回放截断重建', () => {
  it('按历史重建的局面与逐步落子一致', () => {
    let s = createBoard(9)
    s = placeStone(s, { x: 4, y: 4 })
    s = placeStone(s, { x: 3, y: 4 })
    s = placeStone(s, { x: 5, y: 4 })
    const rebuilt = stateFromHistory(s, s.history.slice(0, 2)) // 只到第 2 手
    expect(rebuilt.history.length).toBe(2)
    expect(rebuilt.turn).toBe(1) // 白已下 → 轮黑
    expect(rebuilt.stones[4 * 9 + 4]).toBe(1)
    expect(rebuilt.stones[4 * 9 + 3]).toBe(-1)
    expect(rebuilt.stones[4 * 9 + 5]).toBe(0)
  })
})

describe('bugfix: sgf 导入容错', () => {
  it('非法/重复着法不抛异常', () => {
    // 同一位置下两次（第二次非法）→ 不应崩溃
    const s = sgfToState('(;SZ[9];B[ee];W[ee])')
    expect(s.history.length).toBe(1) // 非法手被跳过
  })
  it('SZ 非法值回退 19 路', () => {
    const s = sgfToState('(;SZ[abc];B[ee])')
    expect(s.size).toBe(19)
    expect(s.history.length).toBe(1)
  })
  it('双 pass 终局后继续有着法不崩溃', () => {
    const s = sgfToState('(;SZ[9];B[];W[];B[ee])')
    expect(s.finished).toBe(true)
  })
})
