import type { GameState, Phase, Team } from './engine'

export const POSE_STRIDE = 5

export interface Frame {
  p: number[]
  d: [number, number, number]
  holder: number
  land: [number, number] | null
  stall: number
}

export interface MetaHuman {
  id: string
  name: string
  team: Team
  controlled: number
}

export interface Meta {
  phase: Phase
  score: Record<Team, number>
  target: number
  stall: number
  possession: Team
  message: string | null
  messageTeam: Team | null
  winner: Team | null
  humans: MetaHuman[]
  replay: { caption: string; team: Team; progress: number } | null
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function snapshotFrame(g: GameState): Frame {
  const p: number[] = []
  for (const pl of g.players) {
    p.push(r2(pl.x), r2(pl.y), r2(pl.dirX), r2(pl.dirY), pl.diveT > 0 || pl.recoverT > 0 ? 1 : 0)
  }
  const d = g.disc
  return {
    p,
    d: [r2(g.discX), r2(g.discY), r2(g.discH)],
    holder: d.kind === 'held' ? d.holder : -1,
    land: d.kind === 'flight' ? [r2(d.ex), r2(d.ey)] : null,
    stall: d.kind === 'held' ? r2(g.stall) : 0,
  }
}

export function lerpFrame(a: Frame, b: Frame, t: number): Frame {
  if (a.p.length !== b.p.length) return b
  const p = b.p.slice()
  for (let i = 0; i < p.length; i += POSE_STRIDE) {
    const dx = b.p[i] - a.p[i]
    const dy = b.p[i + 1] - a.p[i + 1]
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) continue
    p[i] = a.p[i] + dx * t
    p[i + 1] = a.p[i + 1] + dy * t
  }
  const jump = Math.abs(b.d[0] - a.d[0]) > 8 || Math.abs(b.d[1] - a.d[1]) > 8
  const d: Frame['d'] = jump
    ? b.d
    : [a.d[0] + (b.d[0] - a.d[0]) * t, a.d[1] + (b.d[1] - a.d[1]) * t, a.d[2] + (b.d[2] - a.d[2]) * t]
  return { ...b, p, d }
}
