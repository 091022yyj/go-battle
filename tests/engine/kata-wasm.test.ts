import { describe, it, expect, vi, beforeEach } from 'vitest'
import { KataWasmEngine } from '../../src/engine/ai/kata-wasm'

// Mock fetch for file existence check
const mockFetch = vi.fn()

// @ts-expect-error - mock global fetch
globalThis.fetch = mockFetch

// Mock Worker
class MockWorker {
  onmessage: ((event: { data: { id: number; ok: boolean; result?: unknown; error?: string } }) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  #pendingMessages: { id: number; cmd: string }[] = []

  postMessage(msg: { id: number; cmd: string; args?: unknown[] }) {
    this.#pendingMessages.push(msg)
    // Simulate async response
    setTimeout(() => {
      if (msg.cmd === 'init') {
        this.onmessage?.({ data: { id: msg.id, ok: true, result: 'initialized' } })
      } else if (msg.cmd === 'execute') {
        const commands = (msg.args?.[0] as string[]) || []
        const lastCmd = commands[commands.length - 1] || ''
        if (lastCmd.startsWith('genmove')) {
          this.onmessage?.({ data: { id: msg.id, ok: true, result: '= dd\n\n' } })
        } else {
          this.onmessage?.({ data: { id: msg.id, ok: true, result: '= info move ee winrate 0.55 scoreLead 1.0\n\n' } })
        }
      } else {
        this.onmessage?.({ data: { id: msg.id, ok: false, error: 'Unknown command' } })
      }
    }, 1)
  }

  terminate() {}
}

// @ts-expect-error - replace global Worker
globalThis.Worker = MockWorker as unknown as typeof Worker

describe('KataWasmEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('isAvailable 检测 WASM 文件存在', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })
    const available = await KataWasmEngine.isAvailable()
    expect(available).toBe(true)
  })

  it('isAvailable 检测 WASM 文件不存在', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false })
    const available = await KataWasmEngine.isAvailable()
    expect(available).toBe(false)
  })

  it('文件缺失时 initialize 抛出错误', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false })
    const engine = new KataWasmEngine()
    await expect(engine.initialize()).rejects.toThrow()
    expect(engine.status).toBe('error')
  })

  it('文件存在时 initialize 成功', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })
    const engine = new KataWasmEngine()
    await engine.initialize()
    expect(engine.status).toBe('idle')
    engine.dispose()
  })

  it('stop 终止 worker', () => {
    const engine = new KataWasmEngine()
    engine.stop()
    expect(engine.status).toBe('idle')
  })

  it('setLevel 不抛出', () => {
    const engine = new KataWasmEngine()
    engine.setLevel(3)
    expect(engine).toBeDefined()
  })
})
