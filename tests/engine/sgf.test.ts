import { describe, it, expect } from 'vitest'
import { createBoard, placeStone, pass } from '../../src/engine/board'
import { stateToSGF, sgfToState } from '../../src/engine/sgf'

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

describe('SGF', () => {
  it('生成含坐标与贴目', () => {
    const b = createBoard(9)
    const s = placeStone(b, { x: 4, y: 4 })
    const sgf = stateToSGF(s, 3.75)
    expect(sgf).toContain('SZ[9]')
    expect(sgf).toContain('KM[3.75]')
    expect(sgf).toContain('B[ee]')  // e=4 in SGF (a=0)
  })

  it('pass 记录为空坐标', () => {
    const b = createBoard(9)
    const s = pass(b)
    const sgf = stateToSGF(s, 0)
    expect(sgf).toContain('B[]')
  })

  it('解析与生成往返一致', () => {
    const b = createBoard(19)
    let s = playSequence(b, [
      { player: 1, point: { x: 3, y: 3 } },
      { player: -1, point: { x: 15, y: 15 } },
      { player: 1, point: { x: 3, y: 15 } },
      { player: -1, point: { x: 15, y: 3 } },
    ])
    s = pass(s)
    const sgf = stateToSGF(s, 6.5)
    const s2 = sgfToState(sgf)
    expect(s2.size).toBe(19)
    expect(s2.stones).toEqual(s.stones)
    expect(s2.history).toEqual(s.history)
  })
})
