import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useEngineStore } from '../../src/stores/engine'
import { useGameStore } from '../../src/stores/game'
import type { EngineAdapter, Move, Analysis } from '../../src/engine/types'

class FakeEngine implements EngineAdapter {
  name = 'fake'
  engineType = 'simple' as const
  status: 'idle' | 'thinking' | 'error' = 'idle'
  replyPoint: { x: number; y: number } | null = null
  setLevel() {}
  stop() {}
  dispose() {}
  constructor(private p: 1 | -1) {}
  async genmove(): Promise<Move> {
    this.status = 'idle'
    if (this.replyPoint) {
      const r = this.replyPoint
      this.replyPoint = null
      return { player: this.p, point: r }
    }
    return { player: this.p, point: null }
  }
  async analyze(): Promise<Analysis> {
    return { score: 0, winRate: 0.5, bestMove: { player: this.p, point: null }, variations: [] }
  }
}

describe('engineStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('EVS 模式：黑引擎先手落子', async () => {
    const e = useEngineStore()
    const g = useGameStore()
    g.newGame(9, 'evc', 3.75)
    const black = new FakeEngine(1)
    const white = new FakeEngine(-1)
    black.replyPoint = { x: 4, y: 4 }
    e.startEvc(g, black, white)
    await new Promise((r) => setTimeout(r, 100))
    expect(g.state.stones[9 * 4 + 4]).toBe(1)
  })

  it('PVE 模式：轮 AI 时自动落子', async () => {
    const e = useEngineStore()
    const g = useGameStore()
    g.newGame(9, 'pve', 3.75)
    g.humanColor = -1 // 人类执白，AI 执黑
    const ai = new FakeEngine(1)
    ai.replyPoint = { x: 4, y: 4 }
    e.startPve(g, ai)
    await new Promise((r) => setTimeout(r, 100))
    expect(g.state.stones[9 * 4 + 4]).toBe(1)
  })
})
