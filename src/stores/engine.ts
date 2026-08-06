import { defineStore } from 'pinia'
import type { EngineAdapter, Move } from '../engine/types'
import type { useGameStore } from './game'

type GameStore = ReturnType<typeof useGameStore>

export const useEngineStore = defineStore('engine', {
  state: () => ({
    black: null as EngineAdapter | null,
    white: null as EngineAdapter | null,
    active: null as EngineAdapter | null,
    timer: null as ReturnType<typeof setTimeout> | null,
  }),
  actions: {
    async startEvc(g: GameStore, black: EngineAdapter, white: EngineAdapter) {
      this.cleanup()
      this.black = black
      this.white = white
      await this.tick(g)
    },
    async startPve(g: GameStore, ai: EngineAdapter) {
      this.cleanup()
      if (g.humanColor === 1) this.white = ai
      else this.black = ai
      await this.tick(g)
    },
    async tick(g: GameStore) {
      if (g.state.finished) return
      const engine = g.state.turn === 1 ? this.black : this.white
      this.active = engine
      if (!engine) return
      this.timer = setTimeout(async () => {
        if (g.state.finished) return
        try {
          const move: Move = await engine.genmove(g.state)
          if (g.state.turn !== move.player) return
          g.playMove(move)
          await this.tick(g)
        } catch {
          engine.status = 'error'
        }
      }, 20)
    },
    onHumanMove(g: GameStore) {
      if (g.mode === 'evc') return
      if (g.mode === 'pve' && g.state.turn !== g.humanColor) this.tick(g)
    },
    stop() {
      this.cleanup()
    },
    cleanup() {
      if (this.timer) clearTimeout(this.timer)
      this.timer = null
      this.black?.dispose()
      this.white?.dispose()
      this.black = null
      this.white = null
      this.active = null
    },
  },
})
