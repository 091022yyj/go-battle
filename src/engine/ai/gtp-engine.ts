import type { Analysis, EngineAdapter, GameState, Move, Player } from '../types'

const COLS = 'abcdefghijklmnopqrstuvwxyz'

export interface GTPConfig {
  host: string
  port: number
  engineName: string // 'kata-go' | 'sayuri'
}

function pointToGTP(p: { x: number; y: number }): string {
  return COLS[p.x] + COLS[p.y]
}

function gtpToPoint(s: string): { x: number; y: number } | null {
  if (!s || s === 'pass' || s === 'PASS' || s === 'resign') return null
  const x = COLS.indexOf(s[0]?.toLowerCase())
  const y = COLS.indexOf(s[1]?.toLowerCase())
  if (x < 0 || y < 0) return null
  return { x, y }
}

export class GTPEngine implements EngineAdapter {
  name: string
  engineType = 'kata-gtp' as const
  status: 'idle' | 'thinking' | 'error' = 'idle'
  #config: GTPConfig
  #ws: WebSocket | null = null
  #requestId = 0
  #pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  #connected = false
  #initialized = false
  #komi = 3.75

  constructor(_player: Player, config: GTPConfig) {
    this.#config = config
    this.name = config.engineName
  }

  setLevel(_level: number): void {
    // GTP engines don't have level setting in the same way
  }

  async connect(): Promise<void> {
    if (this.#ws) return

    this.status = 'idle'
    const { host, port } = this.#config

    return new Promise((resolve, reject) => {
      const url = `ws://${host}:${port}`
      const ws = new WebSocket(url)
      this.#ws = ws

      const timeout = setTimeout(() => {
        this.status = 'error'
        reject(new Error(`Connection to ${url} timed out`))
      }, 5000)

      ws.onopen = async () => {
        clearTimeout(timeout)
        this.#connected = true
        try {
          // Verify engine responds
          const nameResp = await this.#send('name')
          console.log(`[GTP] Connected to ${nameResp.response}`)
          resolve()
        } catch {
          this.status = 'error'
          reject(new Error('Engine not responding to GTP commands'))
        }
      }

      ws.onclose = () => {
        this.#connected = false
        this.#initialized = false
        if (this.status !== 'error') this.status = 'error'
      }

      ws.onerror = () => {
        clearTimeout(timeout)
        this.status = 'error'
        reject(new Error(`Failed to connect to ${url}`))
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          const req = this.#pending.get(msg.id)
          if (req) {
            this.#pending.delete(msg.id)
            if (msg.ok) {
              req.resolve(msg)
            } else {
              req.reject(new Error(msg.error || 'GTP error'))
            }
          }
        } catch {
          // ignore parse errors
        }
      }
    })
  }

  async initBoard(size: number, komi: number): Promise<void> {
    if (!this.#connected) await this.connect()
    await this.#send('boardsize', [String(size)])
    await this.#send('clear_board')
    await this.#send('komi', [String(komi)])
    this.#komi = komi
    this.#initialized = true
  }

  async #send(cmd: string, args: string[] = []): Promise<{ ok: boolean; response?: string; error?: string }> {
    if (!this.#ws || this.#ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected')
    }
    const id = ++this.#requestId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id)
        this.status = 'error'
        reject(new Error(`GTP command timeout: ${cmd}`))
      }, 30000)

      this.#pending.set(id, {
        resolve: (v: unknown) => {
          clearTimeout(timer)
          resolve(v as { ok: boolean; response?: string; error?: string })
        },
        reject: (e: Error) => {
          clearTimeout(timer)
          reject(e)
        },
      })

      this.#ws!.send(JSON.stringify({ id, cmd, args }))
    })
  }

  async #replayHistory(state: GameState): Promise<void> {
    // GTP engines maintain their own board state, so we replay all moves
    // First reset
    await this.#send('boardsize', [String(state.size)])
    await this.#send('clear_board')
    await this.#send('komi', [String(this.#komi)])

    for (const m of state.history) {
      if (m.point) {
        const color = m.player === 1 ? 'B' : 'W'
        const coord = pointToGTP(m.point)
        await this.#send('play', [color, coord])
      }
    }
  }

  async genmove(state: GameState): Promise<Move> {
    if (!this.#initialized) {
      await this.initBoard(state.size, this.#komi)
    }

    this.status = 'thinking'

    try {
      // Replay history to sync engine state
      await this.#replayHistory(state)

      const color = state.turn === 1 ? 'B' : 'W'
      const result = await this.#send('genmove', [color])
      this.status = 'idle'

      const point = gtpToPoint(result.response || '')
      return { player: state.turn, point }
    } catch (err) {
      this.status = 'error'
      throw err
    }
  }

  async analyze(state: GameState): Promise<Analysis> {
    if (!this.#initialized) {
      await this.initBoard(state.size, this.#komi)
    }

    this.status = 'thinking'

    try {
      await this.#replayHistory(state)

      const color = state.turn === 1 ? 'B' : 'W'

      // Use engine-specific analyze command
      const analyzeCmd = this.#config.engineName === 'sayuri' ? 'analyze' : 'kata-analyze'
      const result = await this.#send(analyzeCmd, [color, '50'])

      this.status = 'idle'

      // Parse analysis output
      const response = result.response || ''
      let winRate = 0.5
      let score = 0
      let bestPoint: { x: number; y: number } | null = null

      // Parse KataGo format: info move D4 visits 12345 winrate 0.5234 scoreLead 1.5 ...
      const moveMatch = response.match(/move\s+(\w+)/i)
      if (moveMatch) {
        bestPoint = gtpToPoint(moveMatch[1])
      }

      const wrMatch = response.match(/winrate\s+([\d.]+)/i)
      if (wrMatch) winRate = parseFloat(wrMatch[1])

      const scoreMatch = response.match(/scoreLead\s+([-\d.]+)/i)
      if (scoreMatch) score = parseFloat(scoreMatch[1])

      const bestMove: Move = {
        player: state.turn,
        point: bestPoint,
      }

      return {
        score,
        winRate,
        bestMove,
        variations: bestPoint ? [[{ player: state.turn, point: bestPoint }]] : [],
      }
    } catch (err) {
      this.status = 'error'
      throw err
    }
  }

  stop(): void {
    if (this.#ws) {
      this.#ws.close()
      this.#ws = null
    }
    this.#connected = false
    this.#initialized = false
    this.status = 'idle'
    // Reject pending requests
    for (const [, req] of this.#pending) {
      req.reject(new Error('Engine stopped'))
    }
    this.#pending.clear()
  }

  dispose(): void {
    this.stop()
  }
}

export function createGTPEngine(player: Player, config: GTPConfig): GTPEngine {
  return new GTPEngine(player, config)
}
