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
    if (!line) return

    if (line === '= OK') {
      // GTP multi-line response continues after = OK
      responseBuffer = ''
      return
    }

    // GTP response format: =[id] response  OR  ?[id] error
    const match = line.match(/^([=?])(\d*)\s*(.*)/)
    if (match) {
      const [, status, idStr, content] = match
      const id = idStr ? parseInt(idStr, 10) : currentId

      if (status === '=') {
        responseBuffer += (responseBuffer ? '\n' : '') + content
        // GTP responses end with a blank line (which we handle above)
        // For single-line responses or after collecting, we resolve
        // We use a short timeout to detect end of multi-line response
        if (pendingRequests.has(id)) {
          clearTimeout(pendingRequests.get(id).timer)
          const timer = setTimeout(() => {
            const req = pendingRequests.get(id)
            if (req) {
              pendingRequests.delete(id)
              req.resolve({ ok: true, response: responseBuffer })
            }
            responseBuffer = ''
            currentId = null
          }, 50)
          if (pendingRequests.has(id)) {
            pendingRequests.get(id).timer = timer
          }
        }
      } else if (status === '?') {
        const req = pendingRequests.get(id)
        if (req) {
          clearTimeout(req.timer)
          pendingRequests.delete(id)
          req.resolve({ ok: false, error: content || 'unknown error' })
        }
        currentId = null
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

  // Send a simple command to verify engine is ready
  setTimeout(() => {
    if (engineProc) {
      engineReady = true
      console.log('[bridge] Engine ready')
    }
  }, 500)
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

function sendCommand(cmd, argsList = []) {
  return new Promise((resolve, reject) => {
    if (!engineProc || !engineReady) {
      return reject(new Error('Engine not ready'))
    }
    const id = ++requestId
    currentId = id
    const timer = setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id)
        reject(new Error(`GTP command timeout: ${cmd}`))
      }
    }, 30000)

    pendingRequests.set(id, { resolve, reject, timer })

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

    const { id, cmd, args: cmdArgs } = msg

    try {
      if (cmd === 'ping') {
        ws.send(JSON.stringify({ id, ok: true, response: 'pong' }))
        return
      }

      const result = await sendCommand(cmd, cmdArgs || [])
      ws.send(JSON.stringify({ id, ok: result.ok, response: result.response, error: result.error }))
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
