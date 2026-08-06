import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useGameStore } from '../../src/stores/game'

describe('gameStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('开局默认 19 路、人机模式、黑先', () => {
    const g = useGameStore()
    expect(g.size).toBe(19)
    expect(g.mode).toBe('pve')
    expect(g.state.turn).toBe(1)
  })

  it('人机模式执黑时人类回合可落子', () => {
    const g = useGameStore()
    g.newGame(9, 'pve', 3.75)
    g.humanColor = 1 // 人类执黑
    expect(g.isHumanTurn).toBe(true)
    g.playHuman({ x: 3, y: 3 })
    expect(g.state.turn).toBe(-1)
    expect(g.isHumanTurn).toBe(false) // 轮到 AI
  })

  it('AI vs AI 模式人类不可落子', () => {
    const g = useGameStore()
    g.newGame(9, 'evc', 3.75)
    expect(g.isHumanTurn).toBe(false)
    g.playHuman({ x: 3, y: 3 })
    expect(g.state.history.length).toBe(0)
  })

  it('悔棋回到上一手', () => {
    const g = useGameStore()
    g.newGame(9, 'pve', 3.75)
    g.humanColor = 1
    g.playHuman({ x: 3, y: 3 })
    g.playMove({ player: -1, point: { x: 5, y: 5 } })
    g.undo()
    expect(g.state.history.length).toBe(1)
  })

  it('认输结束对局', () => {
    const g = useGameStore()
    g.resign()
    expect(g.state.finished).toBe(true)
  })

  it('换棋盘尺寸开新局', () => {
    const g = useGameStore()
    g.newGame(9, 'pve', 3.75)
    expect(g.size).toBe(9)
    expect(g.state.stones.length).toBe(81)
  })
})
