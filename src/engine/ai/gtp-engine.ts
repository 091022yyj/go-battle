import type { Analysis, CandidateMove, EngineAdapter, GameState, Move, Player } from '../types'

// GTP 标准坐标：列字母跳过 'i'（a-h, j-t），行号为从底部数起的数字（1 = 最底行）
const GTP_COLS = 'abcdefghjklmnopqrstuvwxyz'

export interface GTPConfig {
  host: string
  port: number
  engineName: string // 'kata-go' | 'sayuri'
}

function pointToGTP(p: { x: number; y: number }, size: number): string {
  if (!p || p.x < 0 || p.y < 0 || p.x >= size || p.y >= size) return ''
  return GTP_COLS[p.x] + String(size - p.y)
}

function gtpToPoint(s: string, size: number): { x: number; y: number } | null {
  const v = s.trim()
  if (!v || v === 'pass' || v === 'PASS' || v === 'resign') return null
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
    // GTP komi 必须是整数或半整数；中式数子 3.75 子 ≈ 7.5 目
    const gtpKomi = komi === 3.75 ? 7.5 : Math.round(komi * 2) / 2
    await this.#send('komi', [String(gtpKomi)])
    this.#komi = gtpKomi
    this.#initialized = true
  }

  async #send(cmd: string, args: string[] = [], streaming = false): Promise<{ ok: boolean; response?: string; error?: string }> {
    if (!this.#ws || this.#ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected')
    }
    const id = ++this.#requestId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id)
        this.status = 'error'
        reject(new Error(`GTP command timeout: ${cmd}`))
      }, streaming ? 90000 : 30000)

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

      this.#ws!.send(JSON.stringify({ id, cmd, args, streaming }))
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
        const coord = pointToGTP(m.point, state.size)
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

      const point = gtpToPoint(result.response || '', state.size)
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
      const result = await this.#analyzeWithStop(analyzeCmd, color, 2)

      this.status = 'idle'

      return this.#parseAnalysis(result.response || '', state)
    } catch (err) {
      this.status = 'error'
      throw err
    }
  }

  /**
   * KataGo GTP 分析协议：kata-analyze 持续输出 info 行，
   * 需发送空行（kata-stop）结束分析。
   */
  async #analyzeWithStop(
    cmd: string,
    color: string,
    seconds: number
  ): Promise<{ ok: boolean; response?: string; error?: string }> {
    const resultPromise = this.#send(cmd, [color, String(seconds)], true)
    await new Promise((r) => setTimeout(r, seconds * 1000 + 500))
    try {
      await this.#send('kata-stop')
    } catch {
      // 引擎可能已自行结束
    }
    return resultPromise
  }

  /**
   * 获取候选着法列表（用于棋盘上显示 AI 思考）。
   */
  async getCandidates(state: GameState, seconds = 3, maxCandidates = 6): Promise<CandidateMove[]> {
    if (!this.#initialized) {
      await this.initBoard(state.size, this.#komi)
    }
    await this.#replayHistory(state)

    const color = state.turn === 1 ? 'B' : 'W'
    const analyzeCmd = this.#config.engineName === 'sayuri' ? 'analyze' : 'kata-analyze'
    const result = await this.#analyzeWithStop(analyzeCmd, color, seconds)

    return this.#parseInfoLines(result.response || '', state).slice(0, maxCandidates)
  }

  /**
   * 解析 KataGo 分析输出：每行可能包含多个候选段
   * （info move E5 visits N ... info move F5 visits N ...），
   * 按点去重取 visits 最大的快照。
   */
  #parseInfoLines(response: string, state: GameState): CandidateMove[] {
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
    return [...seen.values()].sort((a, b) => b.winRate - a.winRate)
  }

  #parseAnalysis(response: string, state: GameState): Analysis {
    const candidates = this.#parseInfoLines(response, state)
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
      variations: bestPoint ? [[{ player: state.turn, point: bestPoint }]] : [],
      candidates,
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
