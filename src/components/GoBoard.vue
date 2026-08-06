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
const MARGIN = 24

function toCanvasPoint(p: Point): { x: number; y: number } {
  return { x: MARGIN + p.x * CELL, y: MARGIN + p.y * CELL }
}

function handleClick(e: MouseEvent) {
  if (!canvas.value) return
  const rect = canvas.value.getBoundingClientRect()
  const x = Math.round((e.clientX - rect.left - MARGIN) / CELL)
  const y = Math.round((e.clientY - rect.top - MARGIN) / CELL)
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
  ctx.fillStyle = '#e8c170'
  ctx.fillRect(0, 0, w, h)

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

  // 星位
  const stars: number[] = n === 9 ? [2, 4, 6] : n === 13 ? [3, 6, 9] : [3, 9, 15]
  for (const sx of stars)
    for (const sy of stars) {
      const p = toCanvasPoint({ x: sx, y: sy })
      ctx.beginPath()
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
      ctx.fillStyle = '#5a4632'
      ctx.fill()
    }

  // 坐标
  if (props.showCoordinates !== false) {
    ctx.fillStyle = '#5a4632'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    const COLS = 'ABCDEFGHJKLMNOPQRST'
    for (let i = 0; i < n; i++) {
      ctx.fillText(COLS[i] ?? String(i + 1), MARGIN + i * CELL, MARGIN - 8)
      ctx.fillText(String(n - i), MARGIN - 12, MARGIN + i * CELL + 4)
    }
  }

  // 棋子
  for (let i = 0; i < g.state.stones.length; i++) {
    const c = g.state.stones[i]
    if (c === 0) continue
    const x = i % n
    const y = Math.floor(i / n)
    const p = toCanvasPoint({ x, y })
    ctx.beginPath()
    ctx.arc(p.x, p.y, CELL / 2 - 3, 0, Math.PI * 2)
    ctx.fillStyle = c === 1 ? '#111' : '#f5f5f5'
    ctx.fill()
    ctx.strokeStyle = '#888'
    ctx.stroke()
  }

  // 最后手标记
  const last = g.state.history[g.state.history.length - 1]
  if (last?.point) {
    const p = toCanvasPoint(last.point)
    ctx.beginPath()
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
    ctx.fillStyle = last.player === 1 ? '#f5f5f5' : '#111'
    ctx.fill()
  }
}

function renderLoop() {
  draw()
  raf = requestAnimationFrame(renderLoop)
}

watch(() => [g.state, g.size], () => draw(), { deep: true })

onMounted(() => {
  ctx = canvas.value?.getContext('2d') ?? null
  renderLoop()
})
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <canvas ref="canvas" @click="handleClick" class="go-board"></canvas>
</template>

<style scoped>
.go-board {
  max-width: 100%;
  height: auto;
  cursor: pointer;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}
</style>
