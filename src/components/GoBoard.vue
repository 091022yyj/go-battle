<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useGameStore } from '../stores/game'
import type { Point } from '../engine/types'

const props = defineProps<{ showCoordinates?: boolean }>()
const canvas = ref<HTMLCanvasElement | null>(null)
const g = useGameStore()
let ctx: CanvasRenderingContext2D | null = null
let raf = 0

const CELL = 36
const MARGIN = 28

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

function draw() {
  const canvasEl = canvas.value
  if (!canvasEl || !ctx) return
  const n = g.size
  const w = MARGIN * 2 + (n - 1) * CELL
  const h = MARGIN * 2 + (n - 1) * CELL
  canvasEl.width = w
  canvasEl.height = h

  // Board background with wood grain effect
  const gradient = ctx.createLinearGradient(0, 0, w, h)
  gradient.addColorStop(0, '#e8c170')
  gradient.addColorStop(0.3, '#d4a84b')
  gradient.addColorStop(0.6, '#e0b860')
  gradient.addColorStop(1, '#c89838')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, w, h)

  // Subtle wood grain lines
  ctx.strokeStyle = 'rgba(139,90,43,0.08)'
  ctx.lineWidth = 1
  for (let i = 0; i < h; i += 4) {
    ctx.beginPath()
    ctx.moveTo(0, i + Math.sin(i * 0.1) * 2)
    ctx.lineTo(w, i + Math.sin(i * 0.1 + 1) * 2)
    ctx.stroke()
  }

  // Grid lines
  ctx.strokeStyle = '#5a4632'
  ctx.lineWidth = 1
  for (let i = 0; i < n; i++) {
    const p = MARGIN + i * CELL
    ctx.beginPath()
    ctx.moveTo(p, MARGIN)
    ctx.lineTo(p, h - MARGIN)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(MARGIN, p)
    ctx.lineTo(w - MARGIN, p)
    ctx.stroke()
  }

  // Board border
  ctx.strokeStyle = '#4a3522'
  ctx.lineWidth = 2.5
  ctx.strokeRect(MARGIN - 1, MARGIN - 1, (n - 1) * CELL + 2, (n - 1) * CELL + 2)

  // Star points
  const stars: number[] = n === 9 ? [2, 4, 6] : n === 13 ? [3, 6, 9] : [3, 9, 15]
  ctx.fillStyle = '#4a3522'
  for (const sx of stars) {
    for (const sy of stars) {
      const p = toCanvasPoint({ x: sx, y: sy })
      ctx.beginPath()
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Coordinates
  if (props.showCoordinates !== false) {
    ctx.fillStyle = '#5a4632'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const COLS = 'ABCDEFGHJKLMNOPQRST'
    for (let i = 0; i < n; i++) {
      ctx.fillText(COLS[i] ?? '', MARGIN + i * CELL, MARGIN - 14)
      ctx.fillText(String(n - i), MARGIN - 16, MARGIN + i * CELL)
    }
  }

  // Stones
  for (let i = 0; i < g.state.stones.length; i++) {
    const c = g.state.stones[i]
    if (c === 0) continue
    const x = i % n
    const y = Math.floor(i / n)
    const p = toCanvasPoint({ x, y })
    const r = CELL / 2 - 2.5

    // Stone shadow
    ctx.beginPath()
    ctx.arc(p.x + 1.5, p.y + 1.5, r, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fill()

    // Stone body
    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2)

    if (c === 1) {
      // Black stone with gradient
      const sg = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, r * 0.1, p.x, p.y, r)
      sg.addColorStop(0, '#555')
      sg.addColorStop(0.7, '#222')
      sg.addColorStop(1, '#111')
      ctx.fillStyle = sg
    } else {
      // White stone with gradient
      const sg = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, r * 0.1, p.x, p.y, r)
      sg.addColorStop(0, '#fff')
      sg.addColorStop(0.7, '#e8e8e8')
      sg.addColorStop(1, '#ccc')
      ctx.fillStyle = sg
    }
    ctx.fill()
    ctx.strokeStyle = c === 1 ? '#000' : '#999'
    ctx.lineWidth = 0.5
    ctx.stroke()
  }

  // Last move marker
  const last = g.state.history[g.state.history.length - 1]
  if (last?.point) {
    const p = toCanvasPoint(last.point)
    ctx.beginPath()
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
    ctx.fillStyle = last.player === 1 ? '#ff6666' : '#ff3333'
    ctx.fill()
  }
}

function renderLoop() {
  draw()
  raf = requestAnimationFrame(renderLoop)
}

watch(() => [g.state.stones, g.state.history.length, g.size], () => draw(), { deep: false })

onMounted(() => {
  ctx = canvas.value?.getContext('2d') ?? null
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
