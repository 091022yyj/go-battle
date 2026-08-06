import type { Analysis, EngineAdapter, GameState, Move } from '../types'

/**
 * KataGo WASM Engine Adapter
 *
 * Loads KataGo's official WASM build in a Web Worker.
 * Requires files placed manually in public/kata/:
 *   - katago.wasm  (WASM binary)
 *   - katago.js    (JS glue code)
 *   - model.bin.gz (neural network weights)
 *
 * Falls back to SimpleAI if files are not found.
 */

interface WorkerRequest {
  id: number
  cmd: string
  args?: unknown[]
}

interface WorkerResponse {
  id: number
  ok: boolean
  result?: unknown
  error?: string
}

const COLS = 'abcdefghijklmnopqrstuvwxyz'

function pointToGTP(p: { x: number; y: number }): string {
  return COLS[p.x] + COLS[p.y]
}

function gtpToPoint(s: string): { x: number; y: number } | null {
  if (!s || s === 'pass' || s === 'PASS') return null
  const x = COLS.indexOf(s[0]?.toLowerCase())
  const y = COLS.indexOf(s[1]?.toLowerCase())
  if (x < 0 || y < 0) return null
  return { x, y }
}

export class KataWasmEngine implements EngineAdapter {
  name = 'kata-wasm'
  engineType = 'kata-wasm' as const
  status: 'idle' | 'thinking' | 'error' = 'idle'
  #worker: Worker | null = null
  #requestId = 0
  #pending = new Map<number, { resolve: (v: WorkerResponse) => void; reject: (e: Error) => void }>()
  #initialized = false

  constructor() {}

  setLevel(_level: number): void {
    // KataGo level can be configured via GTP options if needed
  }

  /**
   * Check if KataGo WASM files exist in public/kata/
   */
  static async isAvailable(): Promise<boolean> {
    try {
      const resp = await fetch('/kata/katago.wasm', { method: 'HEAD' })
      return resp.ok
    } catch {
      return false
    }
  }

  async initialize(): Promise<void> {
    const available = await KataWasmEngine.isAvailable()
    if (!available) {
      this.status = 'error'
      throw new Error('KataGo WASM files not found in public/kata/')
    }

    try {
      // Create Web Worker
      this.#worker = new Worker(
        new URL('./kata-worker.ts', import.meta.url),
        { type: 'module' }
      )

      this.#worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const msg = event.data
        const req = this.#pending.get(msg.id)
        if (req) {
          this.#pending.delete(msg.id)
          if (msg.ok) {
            req.resolve(msg)
          } else {
            req.reject(new Error(msg.error || 'Worker error'))
          }
        }
      }

      this.#worker.onerror = (err) => {
        console.error('[KataWasm] Worker error:', err)
        this.status = 'error'
        for (const [, req] of this.#pending) {
          req.reject(new Error('Worker crashed'))
        }
        this.#pending.clear()
      }

      // Initialize the engine in the worker
      await this.#sendWorker('init', [])
      this.#initialized = true
      this.status = 'idle'
    } catch (err) {
      this.status = 'error'
      throw err
    }
  }

  #sendWorker(cmd: string, args: unknown[] = []): Promise<WorkerResponse> {
    if (!this.#worker) throw new Error('Worker not initialized')

    const id = ++this.#requestId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id)
        reject(new Error(`Worker command timeout: ${cmd}`))
      }, 60000)

      this.#pending.set(id, {
        resolve: (v: WorkerResponse) => {
          clearTimeout(timer)
          resolve(v)
        },
        reject: (e: Error) => {
          clearTimeout(timer)
          reject(e)
        },
      })

      this.#worker!.postMessage({ id, cmd, args } satisfies WorkerRequest)
    })
  }

  async genmove(state: GameState): Promise<Move> {
    if (!this.#initialized) {
      await this.initialize()
    }

    this.status = 'thinking'

    try {
      // Build GTP command sequence to sync board state
      const commands: string[] = []
      commands.push(`boardsize ${state.size}`)
      commands.push('clear_board')

      for (const m of state.history) {
        if (m.point) {
          const color = m.player === 1 ? 'B' : 'W'
          commands.push(`play ${color} ${pointToGTP(m.point)}`)
        }
      }

      const color = state.turn === 1 ? 'B' : 'W'
      commands.push(`genmove ${color}`)

      const result = await this.#sendWorker('execute', [commands])
      this.status = 'idle'

      const response = (result.result as string) || ''
      const lines = response.split('\n').filter(l => l.trim())
      const lastLine = lines[lines.length - 1] || ''

      // Parse GTP response: = genmove_response
      const gtpResponse = lastLine.startsWith('=') ? lastLine.slice(1).trim() : lastLine.trim()
      const point = gtpToPoint(gtpResponse)

      return { player: state.turn, point }
    } catch (err) {
      this.status = 'error'
      throw err
    }
  }

  async analyze(state: GameState): Promise<Analysis> {
    if (!this.#initialized) {
      await this.initialize()
    }

    this.status = 'thinking'

    try {
      const commands: string[] = []
      commands.push(`boardsize ${state.size}`)
      commands.push('clear_board')

      for (const m of state.history) {
        if (m.point) {
          const color = m.player === 1 ? 'B' : 'W'
          commands.push(`play ${color} ${pointToGTP(m.point)}`)
        }
      }

      const color = state.turn === 1 ? 'B' : 'W'
      commands.push(`kata-analyze ${color} 50`)

      const result = await this.#sendWorker('execute', [commands])
      this.status = 'idle'

      const response = (result.result as string) || ''
      let winRate = 0.5
      let score = 0
      let bestPoint: { x: number; y: number } | null = null

      const moveMatch = response.match(/move\s+(\w+)/i)
      if (moveMatch) bestPoint = gtpToPoint(moveMatch[1])

      const wrMatch = response.match(/winrate\s+([\d.]+)/i)
      if (wrMatch) winRate = parseFloat(wrMatch[1])

      const scoreMatch = response.match(/scoreLead\s+([-\d.]+)/i)
      if (scoreMatch) score = parseFloat(scoreMatch[1])

      return {
        score,
        winRate,
        bestMove: { player: state.turn, point: bestPoint },
        variations: bestPoint ? [[{ player: state.turn, point: bestPoint }]] : [],
      }
    } catch (err) {
      this.status = 'error'
      throw err
    }
  }

  stop(): void {
    if (this.#worker) {
      this.#worker.terminate()
      this.#worker = null
    }
    this.#initialized = false
    this.status = 'idle'
    for (const [, req] of this.#pending) {
      req.reject(new Error('Engine stopped'))
    }
    this.#pending.clear()
  }

  dispose(): void {
    this.stop()
  }
}
