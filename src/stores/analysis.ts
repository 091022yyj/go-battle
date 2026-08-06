import { defineStore } from 'pinia'
import type { Analysis } from '../engine/types'

export interface CurvePoint {
  moveNumber: number
  winRate: number
}

export const useAnalysisStore = defineStore('analysis', {
  state: () => ({
    latest: null as Analysis | null,
    curve: [] as CurvePoint[],
    running: false,
  }),
  actions: {
    setAnalysis(a: Analysis, moveNumber: number) {
      this.latest = a
      this.running = false
      this.push({ moveNumber, winRate: a.winRate })
    },
    push(p: CurvePoint) {
      this.curve = [...this.curve, p]
    },
    setRunning(v: boolean) {
      this.running = v
    },
    reset() {
      this.latest = null
      this.curve = []
      this.running = false
    },
  },
})
