import type { Analysis, CandidateMove, EngineAdapter, GameState, Move } from '../types'

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

// GTP 标准坐标：列字母跳过 'i'（a-h, j-t），行号为从底部数起的数字（1 = 最底行）
const GTP_COLS = 'abcdefghjklmnopqrstuvwxyz'

function pointToGTP(p: { x: number; y: number }, size: number): string {
  if (!p || p.x < 0 || p.y < 0 || p.x >= size || p.y >= size) return ''
  return GTP_COLS[p.x] + String(size - p.y)
}

function gtpToPoint(s: string, size: number): { x: number; y: number } | null {
  const v = s.trim()
  if (!v || v === 'pass' || v === 'PASS') return null
  const col = v[0]?.toLowerCase()
  const rowStr = v.slice(1)
  if (!col || !rowStr) return null
  const x = GTP_COLS.indexOf(col)
  const row = parseInt(rowStr, 10)
  if (x < 0 || isNaN(row)) return null
  const y = size - row
  if (x >= size || y < 0 || y >= size) return null
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
          commands.push(`play ${color} ${pointToGTP(m.point, state.size)}`)
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
      const point = gtpToPoint(gtpResponse, state.size)

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
          commands.push(`play ${color} ${pointToGTP(m.point, state.size)}`)
        }
      }

      const color = state.turn === 1 ? 'B' : 'W'
      commands.push(`kata-analyze ${color} 50`)

      const result = await this.#sendWorker('execute', [commands])
      this.status = 'idle'

      const analysis = this.#parseAnalysis((result.result as string) || '', state)
      return {
        score: analysis.score,
        winRate: analysis.winRate,
        bestMove: analysis.bestMove,
        variations: analysis.bestMove.point ? [[analysis.bestMove]] : [],
        candidates: analysis.candidates,
      }
    } catch (err) {
      this.status = 'error'
      throw err
    }
  }

  #parseAnalysis(response: string, state: GameState): {
    score: number
    winRate: number
    bestMove: Move
    candidates: CandidateMove[]
  } {
    // 每行可能包含多个候选段，按点去重取 visits 最大的快照
    const seen = new Map<string, CandidateMove>()
    const lines = response.split('\n').filter((l) => l.startsWith('info'))
    for (const line of lines) {
      const re = /move\s+(\w+)\s+.*?visits\s+(\d+)\s+.*?winrate\s+([\d.]+)\s+.*?scoreLead\s+([-\d.]+)/gi
      let m: RegExpExecArray | null
      while ((m = re.exec(line))) {
        const point = gtpToPoint(m[1], state.size)
        if (!point) continue
        const cand: CandidateMove = {
          point,
          visits: parseInt(m[2], 10),
          winRate: parseFloat(m[3]),
          scoreLead: parseFloat(m[4]),
        }
        const key = `${point.x},${point.y}`
        const prev = seen.get(key)
        if (!prev || cand.visits >= prev.visits) seen.set(key, cand)
      }
    }
    const candidates = [...seen.values()].sort((a, b) => b.winRate - a.winRate)

    let winRate = 0.5
    let score = 0
    let bestPoint: { x: number; y: number } | null = null
    if (candidates.length > 0) {
      const best = candidates[0]
      bestPoint = best.point
      winRate = best.winRate
      score = best.scoreLead
    }

    return {
      score,
      winRate,
      bestMove: { player: state.turn, point: bestPoint },
      candidates,
    }
  }

  /**
   * 候选着法列表（发送 kata-analyze 快速获取）
   */
  async getCandidates(state: GameState, visits = 150, maxCandidates = 6): Promise<CandidateMove[]> {
    if (!this.#initialized) {
      await this.initialize()
    }

    const commands: string[] = []
    commands.push(`boardsize ${state.size}`)
    commands.push('clear_board')
    for (const m of state.history) {
      if (m.point) {
        const color = m.player === 1 ? 'B' : 'W'
        commands.push(`play ${color} ${pointToGTP(m.point, state.size)}`)
      }
    }
    const color = state.turn === 1 ? 'B' : 'W'
    commands.push(`kata-analyze ${color} ${visits}`)

    const result = await this.#sendWorker('execute', [commands])
    const analysis = this.#parseAnalysis((result.result as string) || '', state)
    return analysis.candidates.slice(0, maxCandidates)
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
