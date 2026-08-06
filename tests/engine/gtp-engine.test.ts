import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GTPEngine } from '../../src/engine/ai/gtp-engine'
import { createBoard, placeStone } from '../../src/engine/board'

// Mock WebSocket
class MockWebSocket {
  url: string
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  readyState = 0 // CONNECTING

  static OPEN = 1
  static CONNECTING = 0

  constructor(url: string) {
    this.url = url
    // Auto-open
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN
      this.onopen?.()
    }, 1)
  }

  send(data: string) {
    const msg = JSON.parse(data)
    // Auto-respond
    setTimeout(() => {
      let response = ''
      if (msg.cmd === 'name') {
        response = JSON.stringify({ id: msg.id, ok: true, response: 'TestEngine' })
      } else if (msg.cmd === 'genmove') {
        // 19 路棋盘，坐标 d16 → {x:3, y:3}（行号 16 = 从底部第 16 行）
        response = JSON.stringify({ id: msg.id, ok: true, response: 'd16' })
      } else if (msg.cmd === 'kata-analyze') {
        response = JSON.stringify({ id: msg.id, ok: true, response: 'info move e16 winrate 0.6 scoreLead 2.5' })
      } else if (msg.cmd === 'boardsize' || msg.cmd === 'clear_board' || msg.cmd === 'komi' || msg.cmd === 'play') {
        response = JSON.stringify({ id: msg.id, ok: true, response: '' })
      } else {
        response = JSON.stringify({ id: msg.id, ok: true, response: '' })
      }
      this.onmessage?.({ data: response })
    }, 1)
  }

  close() {
    this.readyState = 3 // CLOSED
    this.onclose?.()
  }
}

// @ts-expect-error - replace global WebSocket
globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket

describe('GTPEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('connect 连接成功', async () => {
    const engine = new GTPEngine(1, { host: 'localhost', port: 3333, engineName: 'test' })
    await engine.connect()
    expect(engine.status).toBe('idle')
    engine.dispose()
  })

  it('genmove 返回合法着法', async () => {
    const engine = new GTPEngine(1, { host: 'localhost', port: 3333, engineName: 'test' })
    await engine.connect()
    await engine.initBoard(19, 3.75)

    const b = createBoard(19)
    const move = await engine.genmove(b)
    expect(move.player).toBe(1)
    // d4 = (3, 3) in SGF
    expect(move.point).toEqual({ x: 3, y: 3 })
    engine.dispose()
  })

  it('analyze 返回分析结果', async () => {
    const engine = new GTPEngine(-1, { host: 'localhost', port: 3333, engineName: 'kata-go' })
    await engine.connect()
    await engine.initBoard(19, 6.5)

    const b = createBoard(19)
    const analysis = await engine.analyze(b)
    expect(analysis.winRate).toBe(0.6)
    expect(analysis.score).toBe(2.5)
    expect(analysis.bestMove).toBeDefined()
    engine.dispose()
  })

  it('stop 清理连接', () => {
    const engine = new GTPEngine(1, { host: 'localhost', port: 3333, engineName: 'test' })
    engine.stop()
    expect(engine.status).toBe('idle')
  })
})
