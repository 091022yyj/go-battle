import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useGameStore } from '../../src/stores/game'

describe('gameStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('开局默认 19 路、双人模式、黑先', () => {
    const g = useGameStore()
    expect(g.size).toBe(19)
    expect(g.mode).toBe('pvp')
    expect(g.state.turn).toBe(1)
  })

  it('双人模式落子切换回合', () => {
    const g = useGameStore()
    g.playHuman({ x: 3, y: 3 })
    expect(g.state.turn).toBe(-1)
    g.playHuman({ x: 15, y: 15 })
    expect(g.state.turn).toBe(1)
  })

  it('悔棋回到上一手', () => {
    const g = useGameStore()
    g.playHuman({ x: 3, y: 3 })
    g.playHuman({ x: 15, y: 15 })
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
    g.newGame(9, 'pvp', 3.75)
    expect(g.size).toBe(9)
    expect(g.state.stones.length).toBe(81)
  })
})
