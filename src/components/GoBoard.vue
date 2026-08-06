<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useGameStore } from '../stores/game'
import { useAnalysisStore } from '../stores/analysis'
import type { Point } from '../engine/types'

const props = defineProps<{ showCoordinates?: boolean }>()
const canvas = ref<HTMLCanvasElement | null>(null)
const g = useGameStore()
const analysis = useAnalysisStore()
let ctx: CanvasRenderingContext2D | null = null
let raf = 0

const CELL = 36
const MARGIN = 28

// Animation state
const animatingStone = ref<{ x: number; y: number; startTime: number } | null>(null)
const capturedStones = ref<{ x: number; y: number; startTime: number }[]>([])
const passIndicator = ref<{ startTime: number; player: 1 | -1 } | null>(null)
let prevStones: number[] = []

const ANIM_DURATION = 200 // ms for stone placement
const CAPTURE_DURATION = 300 // ms for capture fade

function toCanvasPoint(p: Point): { x: number; y: number } {
  return { x: MARGIN + p.x * CELL, y: MARGIN + p.y * CELL }
}

function handleClick(e: MouseEvent) {
  if (!canvas.value || g.state.finished) return
  if (!g.isHumanTurn) return
  const rect = canvas.value.getBoundingClientRect()
  const scaleX = canvas.value.width / rect.width
  const scaleY = canvas.value.height / rect.height
  const x = Math.round((e.clientX - rect.left) * scaleX / CELL - MARGIN / CELL)
  const y = Math.round((e.clientY - rect.top) * scaleY / CELL - MARGIN / CELL)
  if (x < 0 || y < 0 || x >= g.size || y >= g.size) return
  g.playHuman({ x, y })
}

// Detect new moves and captures for animation
watch(() => g.state.history.length, (len) => {
  const now = performance.now()
  const last = g.state.history[len - 1]

  // Detect captured stones by comparing previous and current stones
  if (prevStones.length === g.state.stones.length) {
    const captured: { x: number; y: number; startTime: number }[] = []
    for (let i = 0; i < g.state.stones.length; i++) {
      if (prevStones[i] !== 0 && g.state.stones[i] === 0) {
        captured.push({
          x: i % g.size,
          y: Math.floor(i / g.size),
          startTime: now,
        })
      }
    }
    if (captured.length > 0) {
      capturedStones.value = captured
    }
  }

  // New stone placement animation
  if (last?.point) {
    animatingStone.value = { x: last.point.x, y: last.point.y, startTime: now }
  } else if (last && !last.point) {
    // Pass indicator
    passIndicator.value = { startTime: now, player: last.player }
  }

  prevStones = [...g.state.stones]
})

function draw() {
  const canvasEl = canvas.value
  if (!canvasEl || !ctx) return
  const n = g.size
  const w = MARGIN * 2 + (n - 1) * CELL
  const h = MARGIN * 2 + (n - 1) * CELL
  canvasEl.width = w
  canvasEl.height = h
  const now = performance.now()

  // Board background
  const gradient = ctx.createLinearGradient(0, 0, w, h)
  gradient.addColorStop(0, '#e8c170')
  gradient.addColorStop(0.3, '#d4a84b')
  gradient.addColorStop(0.6, '#e0b860')
  gradient.addColorStop(1, '#c89838')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, w, h)

  // Wood grain
  ctx.strokeStyle = 'rgba(139,90,43,0.08)'
  ctx.lineWidth = 1
  for (let i = 0; i < h; i += 4) {
    ctx.beginPath()
    ctx.moveTo(0, i + Math.sin(i * 0.1) * 2)
    ctx.lineTo(w, i + Math.sin(i * 0.1 + 1) * 2)
    ctx.stroke()
  }

  // Grid
  ctx.strokeStyle = '#5a4632'
  ctx.lineWidth = 1
  for (let i = 0; i < n; i++) {
    const p = MARGIN + i * CELL
    ctx.beginPath(); ctx.moveTo(p, MARGIN); ctx.lineTo(p, h - MARGIN); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(MARGIN, p); ctx.lineTo(w - MARGIN, p); ctx.stroke()
  }

  // Border
  ctx.strokeStyle = '#4a3522'
  ctx.lineWidth = 2.5
  ctx.strokeRect(MARGIN - 1, MARGIN - 1, (n - 1) * CELL + 2, (n - 1) * CELL + 2)

  // Star points
  const stars: number[] = n === 9 ? [2, 4, 6] : n === 13 ? [3, 6, 9] : [3, 9, 15]
  ctx.fillStyle = '#4a3522'
  for (const sx of stars)
    for (const sy of stars) {
      const p = toCanvasPoint({ x: sx, y: sy })
      ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fill()
    }

  // Coordinates
  if (props.showCoordinates !== false) {
    ctx.fillStyle = '#5a4632'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    const COLS = 'ABCDEFGHJKLMNOPQRST'
    for (let i = 0; i < n; i++) {
      ctx.fillText(COLS[i] ?? '', MARGIN + i * CELL, MARGIN - 14)
      ctx.fillText(String(n - i), MARGIN - 16, MARGIN + i * CELL)
    }
  }

  // Draw captured stones (fading out)
  const activeCaptures = capturedStones.value.filter(c => now - c.startTime < CAPTURE_DURATION)
  for (const cap of activeCaptures) {
    const progress = (now - cap.startTime) / CAPTURE_DURATION
    const alpha = 1 - progress
    const p = toCanvasPoint({ x: cap.x, y: cap.y })
    const r = CELL / 2 - 2.5
    ctx.globalAlpha = alpha
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
    ctx.fillStyle = '#ff4444'; ctx.fill()
    ctx.globalAlpha = 1
  }
  if (activeCaptures.length === 0 && capturedStones.value.length > 0) {
    capturedStones.value = []
  }

  // Stones
  const isAnimating = animatingStone.value && (now - animatingStone.value.startTime < ANIM_DURATION)
  const animPoint = animatingStone.value
  let animProgress = 1
  if (isAnimating && animPoint) {
    animProgress = Math.min(1, (now - animPoint.startTime) / ANIM_DURATION)
    // Ease-out
    animProgress = 1 - Math.pow(1 - animProgress, 3)
  }

  for (let i = 0; i < g.state.stones.length; i++) {
    const c = g.state.stones[i]
    if (c === 0) continue
    const x = i % n
    const y = Math.floor(i / n)

    // Skip the animating stone (draw it separately with animation)
    if (isAnimating && animPoint && x === animPoint.x && y === animPoint.y) continue

    drawStone(x, y, c, 1)
  }

  // Draw animating stone
  if (isAnimating && animPoint) {
    const c = g.state.stones[animPoint.y * n + animPoint.x]
    if (c !== 0) {
      drawStone(animPoint.x, animPoint.y, c, animProgress)
    }
  } else if (animatingStone.value) {
    animatingStone.value = null
  }

  // AI 思考候选点（实心圆点 + 胜率百分比）
  if (analysis.candidates.length > 0 && !g.state.finished) {
    for (const c of analysis.candidates) {
      if (!c.point || c.point.x >= n || c.point.y >= n) continue
      const p = toCanvasPoint(c.point)
      const isOccupied = g.state.stones[c.point.y * n + c.point.x] !== 0
      if (isOccupied) continue

      // 圆点：胜率越高越大越红
      const wr = Math.max(0, Math.min(1, c.winRate))
      const r = 3 + wr * 6
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255, 60, 60, ${0.25 + wr * 0.4})`
      ctx.fill()
      ctx.lineWidth = 1
      ctx.strokeStyle = `rgba(255, 60, 60, ${0.3 + wr * 0.5})`
      ctx.stroke()

      // 胜率数字（带背景描边保证可读）
      const label = `${Math.round(wr * 100)}%`
      ctx.font = 'bold 10px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const ly = p.y - r - 5
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(232,193,112,0.9)'
      ctx.strokeText(label, p.x, ly)
      ctx.fillStyle = wr > 0.6 ? '#c41e1e' : '#7a4a12'
      ctx.fillText(label, p.x, ly)
    }
  }

  // Last move marker (pulse)
  const last = g.state.history[g.state.history.length - 1]
  if (last?.point && (!isAnimating || (animPoint && (last.point.x !== animPoint.x || last.point.y !== animPoint.y)))) {
    const p = toCanvasPoint(last.point)
    const pulse = 1 + Math.sin(now * 0.005) * 0.3
    ctx.beginPath()
    ctx.arc(p.x, p.y, 4.5 * pulse, 0, Math.PI * 2)
    ctx.fillStyle = last.player === 1 ? '#ff6666' : '#ff3333'
    ctx.fill()
  }

  // Pass indicator
  if (passIndicator.value && now - passIndicator.value.startTime < 1200) {
    const progress = (now - passIndicator.value.startTime) / 1200
    const alpha = progress < 0.2 ? progress / 0.2 : progress > 0.8 ? (1 - progress) / 0.2 : 1
    ctx.globalAlpha = alpha
    ctx.fillStyle = passIndicator.value.player === 1 ? '#111' : '#f5f5f5'
    ctx.font = 'bold 22px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('PASS', w / 2, MARGIN - 4)
    ctx.globalAlpha = 1
  } else if (passIndicator.value) {
    passIndicator.value = null
  }
}

function drawStone(x: number, y: number, color: 1 | -1, scale: number) {
  if (!ctx) return
  const p = toCanvasPoint({ x, y })
  const r = (CELL / 2 - 2.5) * scale

  if (r < 1) return

  // Shadow
  ctx.beginPath()
  ctx.arc(p.x + 1.5 * scale, p.y + 1.5 * scale, r, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.fill()

  // Stone body
  ctx.beginPath()
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2)

  if (color === 1) {
    const sg = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, r * 0.1, p.x, p.y, r)
    sg.addColorStop(0, '#555')
    sg.addColorStop(0.7, '#222')
    sg.addColorStop(1, '#111')
    ctx.fillStyle = sg
  } else {
    const sg = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, r * 0.1, p.x, p.y, r)
    sg.addColorStop(0, '#fff')
    sg.addColorStop(0.7, '#e8e8e8')
    sg.addColorStop(1, '#ccc')
    ctx.fillStyle = sg
  }
  ctx.fill()
  ctx.strokeStyle = color === 1 ? '#000' : '#999'
  ctx.lineWidth = 0.5
  ctx.stroke()
}

function renderLoop() {
  draw()
  raf = requestAnimationFrame(renderLoop)
}

watch(() => [g.size], () => {
  prevStones = []
})

onMounted(() => {
  ctx = canvas.value?.getContext('2d') ?? null
  prevStones = [...g.state.stones]
  renderLoop()
})
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <div class="board-wrapper">
    <canvas
      ref="canvas"
      @click="handleClick"
      class="go-board"
      :class="{ clickable: g.isHumanTurn && !g.state.finished }"
    ></canvas>
  </div>
</template>

<style scoped>
.board-wrapper {
  display: inline-block;
  border-radius: 12px;
  overflow: hidden;
  box-shadow:
    0 8px 32px rgba(0,0,0,0.5),
    0 2px 8px rgba(0,0,0,0.3),
    inset 0 1px 0 rgba(255,255,255,0.1);
  transition: transform 0.3s ease;
}

.go-board {
  display: block;
  max-width: min(80vw, 680px);
  height: auto;
}

.go-board.clickable {
  cursor: pointer;
}

.go-board.clickable:hover {
  filter: brightness(1.02);
}
</style>
