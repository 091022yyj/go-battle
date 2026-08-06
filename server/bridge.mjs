#!/usr/bin/env node

/**
 * GTP Bridge Server
 * WebSocket ↔ GTP (Go Text Protocol) relay for KataGo / Sayuri engines.
 *
 * Usage:
 *   node server/bridge.mjs --engine /path/to/katago --args "gtp -model model.bin.gz"
 *   node server/bridge.mjs --engine /path/to/sayuri --port 3333
 *
 * Browser connects via WebSocket to ws://localhost:3333
 * Sends JSON: { id, cmd, args }
 * Receives JSON: { id, ok, response, error }
 */

import { WebSocketServer } from 'ws'
import { spawn } from 'child_process'
import { createInterface } from 'readline'
import { parseArgs } from 'util'

// --- CLI arg parsing ---
const { values: args } = parseArgs({
  options: {
    engine: { type: 'string' },
    args: { type: 'string', default: '' },
    port: { type: 'string', default: '3333' },
    host: { type: 'string', default: 'localhost' },
  },
})

if (!args.engine) {
  console.error('Usage: node bridge.mjs --engine <path> [--args "<args>"] [--port 3333]')
  process.exit(1)
}

const ENGINE_PATH = args.engine
const ENGINE_ARGS = args.args ? args.args.split(/\s+/) : []
const PORT = parseInt(args.port, 10)
const HOST = args.host

// --- 调试日志（非刷屏：每命令一行，绝不打印 info 流式行） ---
const DEBUG = process.env.GO_BATTLE_DEBUG === '1'
function logCmd(cmd, argsList = [], streaming = false) {
  if (!DEBUG && !['kata-analyze', 'analyze', 'genmove', 'play', 'boardsize'].includes(cmd)) return
  const s = argsList && argsList.length ? ' ' + argsList.join(' ') : ''
  console.log(`[cmd] ← ${cmd}${s}${streaming ? ' (streaming)' : ''}`)
}
// 单行摘要：从响应中提取第一个候选着法（点+visits+winrate）或响应开头
function summarizeResponse(resp, maxLen = 90) {
  if (!resp) return '∅'
  const m = resp.match(/info move (\w+) visits (\d+).*?winrate ([\d.]+)/)
  if (m) return `best=${m[1]} visits=${m[2]} winrate=${(+m[3]).toFixed(2)}`
  const one = resp.split('\n')[0]
  return one.length > maxLen ? one.slice(0, maxLen) + '…' : one
}

// --- Engine process management ---
let engineProc = null
let engineReady = false
const pendingRequests = new Map() // id → { resolve, reject, timer }
let requestId = 0
let responseBuffer = ''
let currentId = null

function startEngine() {
  console.log(`[bridge] Starting engine: ${ENGINE_PATH} ${ENGINE_ARGS.join(' ')}`)

  engineProc = spawn(ENGINE_PATH, ENGINE_ARGS, {
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  const rl = createInterface({ input: engineProc.stdout })

  rl.on('line', (line) => {
    line = line.trim()

    // 空行 = GTP 响应结束（多行响应用空行分隔）
    if (!line) {
      if (currentId !== null && pendingRequests.has(currentId)) {
        const req = pendingRequests.get(currentId)
        clearTimeout(req.timer)
        pendingRequests.delete(currentId)
        console.log(`[cmd] → #${currentId} done (${summarizeResponse(responseBuffer)})`)
        req.resolve({ ok: true, response: responseBuffer })
        responseBuffer = ''
        currentId = null
      }
      return
    }

    // GTP response format: =[id] response  OR  ?[id] error
    const match = line.match(/^([=?])(\d*)\s*(.*)/)
    if (match) {
      const [, status, idStr, content] = match
      const id = idStr ? parseInt(idStr, 10) : currentId

      if (status === '=') {
        // 响应正文（kata-analyze 的 "= OK" 也是响应起始）
        currentId = id
        responseBuffer += (responseBuffer ? '\n' : '') + content
        const req = pendingRequests.get(id)
        if (req) {
          if (!req.streaming) {
            // 单行响应：若引擎不输出结尾空行，80ms 后强制结束
            clearTimeout(req.timer)
            const timer = setTimeout(() => {
              const r = pendingRequests.get(id)
              if (r) {
                pendingRequests.delete(id)
                console.log(`[cmd] → #${id} ok (${summarizeResponse(responseBuffer)})`)
                r.resolve({ ok: true, response: responseBuffer })
              }
              responseBuffer = ''
              currentId = null
            }, 80)
            req.timer = timer
          }
          // streaming：保留 sendCommand 的长兜底 timer，等待空行结束
        }
      } else if (status === '?') {
        const req = pendingRequests.get(id)
        if (req) {
          clearTimeout(req.timer)
          pendingRequests.delete(id)
          console.log(`[cmd] → #${id} ERROR: ${(content || 'unknown error').slice(0, 120)}`)
          req.resolve({ ok: false, error: content || 'unknown error' })
        }
        currentId = null
        responseBuffer = ''
      }
    } else {
      // 非 =/? 行（kata-analyze 的 info 行等）→ 累积到响应正文
      if (currentId !== null) {
        responseBuffer += (responseBuffer ? '\n' : '') + line
        // 流式命令：实时推送每一行给客户端
        const req = pendingRequests.get(currentId)
        if (req && req.streaming && req.onLine) {
          req.onLine(line)
        }
      }
    }
  })

  engineProc.stderr.on('data', (data) => {
    console.error(`[engine stderr] ${data.toString().trim()}`)
  })

  engineProc.on('error', (err) => {
    console.error(`[bridge] Engine process error: ${err.message}`)
    engineReady = false
  })

  engineProc.on('close', (code) => {
    console.log(`[bridge] Engine process exited with code ${code}`)
    engineProc = null
    engineReady = false
    // Reject all pending requests
    for (const [id, req] of pendingRequests) {
      clearTimeout(req.timer)
      req.reject(new Error('Engine process exited'))
    }
    pendingRequests.clear()
  })

  // 等待引擎响应：轮询 name 命令直到有响应
  // （KataGo 首次启动需 10-30 秒初始化 GPU + 加载模型）
  // 注意：预热完成前 engineReady 保持 false，浏览器请求会收到明确错误而非排队卡住
  const checkReady = async () => {
    if (!engineProc) return
    try {
      const resp = await sendCommand('name', [], { force: true })
      if (resp.ok) {
        console.log('[bridge] Engine responding, starting warmup...')
        warmupEngine()
        return
      }
      setTimeout(checkReady, 2000)
    } catch {
      setTimeout(checkReady, 2000)
    }
  }

  // 预热：OpenCL 后端首次搜索需编译 kernel（可能 30-60 秒），
  // 启动后先跑一次较长分析让 kernel 完全编译，避免首局极慢。
  // 注意：预热必须用真实对局尺寸（19 路）——KataGo 对每个
  // boardsize 单独编译 NN kernel，若用 9 路预热，首局 19 路
  // 仍需现场编译，表现为"AI 一直思考不下"。
  const warmupEngine = async () => {
    try {
      console.log('[bridge] Warming up engine (kernel compile, 19x19)...')
      await sendCommand('boardsize', ['19'], { force: true })
      await sendCommand('clear_board', [], { force: true })
      const p = sendCommand('kata-analyze', ['B', '8'], { force: true, streaming: true })
      await new Promise((r) => setTimeout(r, 8500))
      try { engineProc?.stdin.write('\n') } catch {}
      await p
      engineReady = true
      console.log('[bridge] Warmup complete, engine ready')
    } catch (e) {
      console.log('[bridge] Warmup failed:', e.message)
      engineReady = true
    }
  }

  setTimeout(checkReady, 3000)
}

function stopEngine() {
  if (engineProc) {
    try {
      engineProc.stdin.write('quit\n')
    } catch {}
    setTimeout(() => {
      if (engineProc) {
        engineProc.kill()
        engineProc = null
      }
    }, 1000)
  }
  engineReady = false
}

function sendCommand(cmd, argsList = [], opts = {}) {
  return new Promise((resolve, reject) => {
    if (!engineProc || (!engineReady && !opts.force)) {
      return reject(new Error('Engine not ready'))
    }
    const id = ++requestId
    currentId = id
    // 流式命令（kata-analyze 等）只在空行时结束；普通命令 30s 兜底
    const timeoutMs = opts.streaming ? 60000 : 30000
    const timer = setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id)
        console.log(`[cmd] → #${id} TIMEOUT after ${timeoutMs / 1000}s: ${cmd}`)
        reject(new Error(`GTP command timeout: ${cmd}`))
      }
    }, timeoutMs)

    pendingRequests.set(id, { resolve, reject, timer, streaming: !!opts.streaming, onLine: opts.onLine })

    logCmd(cmd, argsList, !!opts.streaming)
    const gtpCmd = id + ' ' + cmd + (argsList.length ? ' ' + argsList.join(' ') : '')
    try {
      engineProc.stdin.write(gtpCmd + '\n')
    } catch (e) {
      clearTimeout(timer)
      pendingRequests.delete(id)
      reject(e)
    }
  })
}

// --- WebSocket server ---
const wss = new WebSocketServer({ host: HOST, port: PORT })

wss.on('listening', () => {
  console.log(`[bridge] WebSocket server listening on ws://${HOST}:${PORT}`)
  startEngine()
})

wss.on('connection', (ws) => {
  console.log('[bridge] Browser connected')

  ws.on('message', async (data) => {
    let msg
    try {
      msg = JSON.parse(data.toString())
    } catch {
      ws.send(JSON.stringify({ id: 0, ok: false, error: 'Invalid JSON' }))
      return
    }

    const { id, cmd, args: cmdArgs, streaming } = msg

    try {
      if (cmd === 'ping') {
        ws.send(JSON.stringify({ id, ok: true, response: 'pong' }))
        return
      }

      if (cmd === 'kata-stop') {
        // 停止当前流式分析：向引擎发送空行（KataGo GTP 分析协议）
        console.log('[cmd] ← kata-stop')
        if (engineProc) {
          engineProc.stdin.write('\n')
          ws.send(JSON.stringify({ id, ok: true, response: 'stopped' }))
        } else {
          ws.send(JSON.stringify({ id, ok: false, error: 'Engine not ready' }))
        }
        return
      }

      // 流式命令：实时转发引擎输出的每一行
      const result = await sendCommand(cmd, cmdArgs || [], {
        streaming,
        onLine: streaming
          ? (line) => {
              ws.send(JSON.stringify({ id, ok: true, streaming: true, line }))
            }
          : undefined,
      })
      ws.send(JSON.stringify({ id, ok: result.ok, done: true, response: result.response, error: result.error }))
    } catch (err) {
      ws.send(JSON.stringify({ id, ok: false, error: err.message }))
    }
  })

  ws.on('close', () => {
    console.log('[bridge] Browser disconnected')
  })

  ws.on('error', (err) => {
    console.error(`[bridge] WebSocket error: ${err.message}`)
  })
})

wss.on('error', (err) => {
  console.error(`[bridge] WebSocket server error: ${err.message}`)
  process.exit(1)
})

// --- Cleanup ---
process.on('SIGINT', () => {
  console.log('\n[bridge] Shutting down...')
  stopEngine()
  wss.close()
  process.exit(0)
})

process.on('SIGTERM', () => {
  stopEngine()
  wss.close()
  process.exit(0)
})
