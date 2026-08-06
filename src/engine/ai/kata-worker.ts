/**
 * KataGo Web Worker
 *
 * This worker loads the KataGo WASM engine and processes GTP commands.
 * It communicates with the main thread via postMessage.
 *
 * When KataGo WASM files are available in /kata/, the worker:
 * 1. Imports the KataGo JS glue code
 * 2. Initializes the WASM module with the model weights
 * 3. Processes GTP commands sent from the main thread
 * 4. Returns GTP responses
 *
 * Request format: { id, cmd, args }
 * Response format: { id, ok, result, error }
 */

interface WorkerMessage {
  id: number
  cmd: string
  args?: unknown[]
}

// KataGo engine state (placeholder for the official build integration)
let initialized = false

/**
 * Load KataGo WASM module.
 * This requires katago.js and katago.wasm in /kata/.
 * Falls back gracefully if files are not found.
 */
async function initKataGo(): Promise<string> {
  try {
    // Dynamic import of the KataGo JS glue
    // The katago.js file should expose a default export or global
    // that allows creating an engine instance.
    // For now, we check if the files exist and provide a clear message.

    const wasmResponse = await fetch('/kata/katago.wasm')
    if (!wasmResponse.ok) {
      throw new Error('katago.wasm not found in /kata/')
    }

    // In a full implementation, this would:
    // 1. Import kataGoModule from '/kata/katago.js'
    // 2. Call kataGoModule() to initialize WASM
    // 3. Load model weights from '/kata/model.bin.gz'
    // 4. Configure GTP mode

    // Placeholder: the actual KataGo JS API depends on the build
    initialized = true
    return 'KataGo engine initialized (placeholder)'
  } catch (err) {
    throw new Error(`Failed to initialize KataGo: ${(err as Error).message}`)
  }
}

/**
 * Execute GTP commands and return the response.
 * In a full implementation, this would pipe commands to the KataGo engine.
 */
async function executeCommands(commands: string[]): Promise<string> {
  if (!initialized) {
    throw new Error('Engine not initialized')
  }

  // In a full implementation, each GTP command would be sent to the engine
  // and the responses collected. For now, return a placeholder.
  const lastCmd = commands[commands.length - 1] || ''

  if (lastCmd.startsWith('genmove')) {
    return '= pass\n\n'
  }

  if (lastCmd.startsWith('kata-analyze')) {
    return '= info move pass winrate 0.5000 scoreLead 0.0\n\n'
  }

  return '= \n\n'
}

// Message handler
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { id, cmd, args } = event.data

  try {
    switch (cmd) {
      case 'init': {
        const result = await initKataGo()
        self.postMessage({ id, ok: true, result })
        break
      }
      case 'execute': {
        const commands = (args?.[0] as string[]) || []
        const result = await executeCommands(commands)
        self.postMessage({ id, ok: true, result })
        break
      }
      default:
        self.postMessage({ id, ok: false, error: `Unknown command: ${cmd}` })
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: (err as Error).message })
  }
}
