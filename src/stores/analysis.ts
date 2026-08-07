import { defineStore } from 'pinia'
import type { Analysis, CandidateMove } from '../engine/types'

export interface CurvePoint {
  moveNumber: number
  winRate: number
}

export interface ReviewBadMove {
  move: number
  from: number
  to: number
}

export interface Review {
  badMoves: ReviewBadMove[]
  peakMove: number
  peakWinRate: number
}

export const useAnalysisStore = defineStore('analysis', {
  state: () => ({
    latest: null as Analysis | null,
    curve: [] as CurvePoint[],
    running: false,
    candidates: [] as CandidateMove[],
    // 当前展示的变化图（AI 预想后续着法，点击候选点触发）
    variation: [] as { x: number; y: number }[],
    review: null as Review | null,
  }),
  actions: {
    setAnalysis(a: Analysis, moveNumber: number, blackWinRate?: number) {
      this.latest = a
      // running 由调用方控制（思考开始置 true，结束置 false）
      // curve 统一存黑方视角胜率（复盘/曲线展示用）
      this.push({ moveNumber, winRate: blackWinRate ?? a.winRate })
    },
    setCandidates(c: CandidateMove[]) {
      this.candidates = c
    },
    clearCandidates() {
      this.candidates = []
    },
    setVariation(v: { x: number; y: number }[]) {
      this.variation = v
    },
    clearVariation() {
      this.variation = []
    },
    push(p: CurvePoint) {
      this.curve = [...this.curve, p]
    },
    setRunning(v: boolean) {
      this.running = v
    },
    /**
     * 终局复盘：从胜率曲线（黑方视角）找出恶手（黑胜率大幅下降的手）
     * 和黑方最佳表现手。
     */
    buildReview() {
      const c = this.curve
      this.review = null
      if (c.length < 3) return
      const badMoves: ReviewBadMove[] = []
      for (let i = 1; i < c.length; i++) {
        const drop = c[i - 1].winRate - c[i].winRate
        if (drop > 0.15) {
          badMoves.push({ move: c[i].moveNumber, from: c[i - 1].winRate, to: c[i].winRate })
        }
      }
      // 黑方峰值
      let peak = c[0]
      for (const p of c) if (p.winRate > peak.winRate) peak = p
      this.review = {
        badMoves,
        peakMove: peak.moveNumber,
        peakWinRate: peak.winRate,
      }
    },
    reset() {
      this.latest = null
      this.curve = []
      this.running = false
      this.candidates = []
      this.variation = []
      this.review = null
    },
  },
})
