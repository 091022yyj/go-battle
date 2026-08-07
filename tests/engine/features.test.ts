import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createBoard } from '../../src/engine/board'
import { parseInfoLineToCandidates } from '../../src/engine/ai/gtp-engine'
import { useGameStore } from '../../src/stores/game'
import { useAnalysisStore } from '../../src/stores/analysis'
import { useEngineStore } from '../../src/stores/engine'

describe('变化图：pv 解析', () => {
  const state = createBoard(19)

  it('解析候选着法与 pv 序列', () => {
    const line = 'info move D4 visits 503 edgeVisits 503 utility 0.1 winrate 0.72 scoreLead 1.59 pv D4 Q16 R17 Q17 R16'
    const cands = parseInfoLineToCandidates(line, state)
    expect(cands.length).toBe(1)
    expect(cands[0].point).toEqual({ x: 3, y: 15 }) // D4
    expect(cands[0].pv?.length).toBe(5)
    expect(cands[0].pv?.[0]).toEqual({ x: 3, y: 15 }) // pv[0] = 候选点
    expect(cands[0].pv?.[1]).toEqual({ x: 15, y: 3 }) // Q16（q=索引15）
  })

  it('多候选段与无 pv 行', () => {
    const line = 'info move C4 visits 300 winrate 0.6 scoreLead 0.5 pv C4 D5 info move Q17 visits 200 winrate 0.55 scoreLead 0.2 pv Q17 Q16'
    const cands = parseInfoLineToCandidates(line, state)
    expect(cands.length).toBe(2)
    const noPv = parseInfoLineToCandidates('info move A1 visits 10 winrate 0.5 scoreLead 0', state)
    expect(noPv[0].pv).toBeUndefined()
  })
})

describe('让子棋：handicapGame', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('2 子：右上星 + 左下星，白先下', () => {
    const g = useGameStore()
    g.newGame(19, 'pve', 7.5)
    g.handicapGame(2)
    const stones = g.state.stones
    expect(stones[3 * 19 + 15]).toBe(1) // (15,3) 黑
    expect(stones[15 * 19 + 3]).toBe(1) // (3,15) 黑
    expect(g.state.turn).toBe(-1) // 白先
    expect(g.state.history.length).toBe(2)
  })

  it('9 子：全部 9 个星位', () => {
    const g = useGameStore()
    g.newGame(19, 'pve', 7.5)
    g.handicapGame(9)
    let blacks = 0
    for (const c of g.state.stones) if (c === 1) blacks++
    expect(blacks).toBe(9)
    expect(g.state.turn).toBe(-1)
  })

  it('非法让子数不生效', () => {
    const g = useGameStore()
    g.newGame(19, 'pve', 7.5)
    g.handicapGame(1)
    expect(g.state.history.length).toBe(0)
  })

  it('让子后 displayState 颜色一致（摆子段显式放置）', () => {
    const g = useGameStore()
    g.newGame(19, 'pve', 7.5)
    g.handicapGame(4)
    const d = g.displayState
    expect(d.stones[3 * 19 + 3]).toBe(1)
    expect(d.stones[15 * 19 + 3]).toBe(1)
    expect(d.stones[3 * 19 + 15]).toBe(1)
    expect(d.stones[15 * 19 + 15]).toBe(1)
  })
})

describe('对局自动保存：saveToHistory/restoreGame', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('落子后保存，恢复后局面一致', () => {
    const g = useGameStore()
    g.newGame(9, 'pve', 7.5)
    g.playHuman({ x: 4, y: 4 })
    g.playHuman({ x: 3, y: 3 }) // 人类执黑连下（跳过 AI？playHuman 会触发引擎——这里直接操作 state 更稳）
    // 直接通过 playMove 构造局面（避免引擎依赖）
    const g2 = useGameStore()
    // 简化：用新局 + 手动 history
    g2.newGame(9, 'pve', 7.5)
    g2.state = {
      ...g2.state,
      turn: -1,
      history: [
        { player: 1, point: { x: 4, y: 4 } },
        { player: -1, point: { x: 3, y: 3 } },
      ],
    }
    g2.cursor = 2
    g2.saveToHistory()
    const games = g2.historyGames()
    expect(games.length).toBe(1)
    expect(games[0].turns).toBe(2)
    expect(games[0].sgf).toContain('SZ[9]')
    // 恢复
    const g3 = useGameStore()
    g3.newGame(19, 'evc', 6.5) // 先污染状态
    g3.restoreGame(games[0].id)
    expect(g3.size).toBe(9)
    expect(g3.mode).toBe('pve')
    expect(g3.state.history.length).toBe(2)
    expect(g3.state.stones[4 * 9 + 4]).toBe(1)
    expect(g3.state.stones[3 * 9 + 3]).toBe(-1)
  })

  it('同局更新不重复保存，上限 30 局', () => {
    const g = useGameStore()
    g.newGame(9, 'pve', 7.5)
    g.state = { ...g.state, history: [{ player: 1, point: { x: 4, y: 4 } }], turn: -1 }
    g.cursor = 1
    g.saveToHistory()
    g.state = { ...g.state, history: [...g.state.history, { player: -1, point: { x: 3, y: 3 } }], turn: 1 }
    g.cursor = 2
    g.saveToHistory()
    expect(g.historyGames().length).toBe(1) // 同局更新
    expect(g.historyGames()[0].turns).toBe(2)
  })
})

describe('停一手（Pass）：人类停一手后 AI 接招', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('停一手记录 pass，轮到 AI 并自动应手', async () => {
    const g = useGameStore()
    g.newGame(9, 'pve', 7.5) // 9 路避免 SimpleAI 在 19 路空盘上模拟过慢
    g.humanColor = 1
    const e = useEngineStore()
    const { createSimpleAI } = await import('../../src/engine/ai/simple-ai')
    e.startPve(g as never, createSimpleAI(-1))
    g.passTurn()
    expect(g.state.history.length).toBe(1)
    expect(g.state.history[0].point).toBeNull() // 停一手
    expect(g.state.turn).toBe(-1) // 轮到 AI
    // AI 应自动思考并落子（simple AI 同步很快）
    await new Promise((r) => setTimeout(r, 600))
    expect(g.state.history.length).toBe(2)
    expect(g.state.turn).toBe(1)
  })

  it('非人类回合不能停一手', () => {
    const g = useGameStore()
    g.newGame(19, 'pve', 7.5)
    g.humanColor = -1 // 人类执白，初始黑先（AI）
    g.passTurn()
    expect(g.state.history.length).toBe(0)
  })
})

describe('AI 复盘：buildReview 恶手检测', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('胜率大幅下滑的手被标记为恶手', () => {
    const a = useAnalysisStore()
    // 黑方视角胜率：第1手 50% → 第2手 75% → 第3手 40%（暴跌）→ 第4手 80%
    a.curve = [
      { moveNumber: 1, winRate: 0.5 },
      { moveNumber: 2, winRate: 0.75 },
      { moveNumber: 3, winRate: 0.4 },
      { moveNumber: 4, winRate: 0.8 },
    ]
    a.buildReview()
    expect(a.review).not.toBeNull()
    expect(a.review!.badMoves.length).toBe(1)
    expect(a.review!.badMoves[0].move).toBe(3) // 第 3 手暴跌
    expect(a.review!.badMoves[0].from).toBeCloseTo(0.75)
    expect(a.review!.badMoves[0].to).toBeCloseTo(0.4)
    expect(a.review!.peakMove).toBe(4) // 峰值第 4 手
  })

  it('平稳对局无恶手', () => {
    const a = useAnalysisStore()
    a.curve = [
      { moveNumber: 1, winRate: 0.5 },
      { moveNumber: 2, winRate: 0.52 },
      { moveNumber: 3, winRate: 0.55 },
    ]
    a.buildReview()
    expect(a.review!.badMoves.length).toBe(0)
  })
})
