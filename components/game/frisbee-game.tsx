'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { InputState, Team } from '@/lib/game/engine'
import type { Frame, Meta } from '@/lib/game/frame'
import type { Session } from '@/lib/game/session'
import {
  DEFAULT_CAMERA,
  computeView,
  localHolding,
  render,
  screenDirToWorld,
  toWorld,
  type Camera,
  type View,
} from '@/lib/game/render'
import { Scoreboard } from './scoreboard'
import { GameOverlay } from './game-overlay'
import { ControlsBar } from './controls-bar'

export interface HudSnapshot {
  mode: Session['mode']
  isHost: boolean
  phase: Meta['phase']
  home: number
  away: number
  target: number
  stall: number
  possession: Team
  localTeam: Team | null
  localHolding: boolean
  message: string | null
  messageTeam: Team | null
  winner: Team | null
  paused: boolean
  replay: { caption: string; team: Team; progress: number } | null
}

const MOVE_KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  KeyW: [0, -1],
  ArrowDown: [0, 1],
  KeyS: [0, 1],
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
}

function snapshot(session: Session, frame: Frame, meta: Meta): HudSnapshot {
  const me = meta.humans.find((h) => h.id === session.localId)
  return {
    mode: session.mode,
    isHost: session.isHost,
    phase: meta.phase,
    home: meta.score.home,
    away: meta.score.away,
    target: meta.target,
    stall: meta.stall,
    possession: meta.possession,
    localTeam: me?.team ?? null,
    localHolding: localHolding(frame, meta, session.localId),
    message: meta.message,
    messageTeam: meta.messageTeam,
    winner: meta.winner,
    paused: session.paused,
    replay: meta.replay ? { ...meta.replay, progress: Math.round(meta.replay.progress * 50) / 50 } : null,
  }
}

interface Pending {
  throwAt: { x: number; y: number } | null
  dive: boolean
  switchPlayer: boolean
  skip: boolean
}

export function FrisbeeGame({ session, onLeave }: { session: Session; onLeave: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewRef = useRef<View | null>(null)
  const sizeRef = useRef({ w: 1, h: 1, dpr: 1 })
  const camRef = useRef<Camera>({ ...DEFAULT_CAMERA })
  const trailRef = useRef<{ x: number; y: number; h: number }[]>([])
  const latestRef = useRef<{ frame: Frame; meta: Meta } | null>(null)
  const keysRef = useRef(new Set<string>())
  const pointerRef = useRef({ down: false, startedHolding: false, world: null as { x: number; y: number } | null })
  const pendingRef = useRef<Pending>({ throwAt: null, dive: false, switchPlayer: false, skip: false })
  const [hud, setHud] = useState<HudSnapshot | null>(null)
  const hudKeyRef = useRef('')

  const togglePause = useCallback(() => {
    if (session.mode === 'solo') session.paused = !session.paused
  }, [session])

  const requestDive = useCallback(() => {
    pendingRef.current.dive = true
  }, [])
  const requestSwitch = useCallback(() => {
    pendingRef.current.switchPlayer = true
  }, [])
  const requestSkip = useCallback(() => {
    pendingRef.current.skip = true
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const font = getComputedStyle(document.body).fontFamily || 'sans-serif'

    const resize = () => {
      const rect = wrap.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      sizeRef.current = { w: rect.width, h: rect.height, dpr }
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      const dt = Math.max(0, Math.min((now - last) / 1000, 1 / 30))
      last = now
      const { w, h, dpr } = sizeRef.current
      const ptr = pointerRef.current
      const pending = pendingRef.current
      const baseView = viewRef.current ?? computeView(w, h, dpr)

      let sx = 0
      let sy = 0
      for (const k of keysRef.current) {
        const m = MOVE_KEYS[k]
        if (m) {
          sx += m[0]
          sy += m[1]
        }
      }
      const l = Math.hypot(sx, sy)
      const inReplay = latestRef.current?.meta.phase === 'replay'
      const input: InputState = {
        move: l > 0 ? screenDirToWorld(baseView, sx / l, sy / l) : { x: 0, y: 0 },
        steerTo: ptr.down && !ptr.startedHolding ? ptr.world : null,
        throwAt: pending.throwAt,
        dive: pending.dive && !inReplay,
        switchPlayer: pending.switchPlayer,
        skip: pending.skip || (inReplay && pending.dive),
      }
      pendingRef.current = { throwAt: null, dive: false, switchPlayer: false, skip: false }
      session.update(dt, input)

      const cur = session.current(now)
      if (cur) {
        latestRef.current = cur
        const { frame, meta } = cur
        const cam = camRef.current
        const target = meta.replay ? { cx: frame.d[0], cy: frame.d[1], z: 1.9 } : DEFAULT_CAMERA
        const k = 1 - Math.exp(-dt * (meta.replay ? 4 : 3))
        cam.cx += (target.cx - cam.cx) * k
        cam.cy += (target.cy - cam.cy) * k
        cam.z += (target.z - cam.z) * k
        const view = computeView(w, h, dpr, cam)
        viewRef.current = view

        const trail = trailRef.current
        if (frame.holder >= 0) trail.length = 0
        else {
          trail.push({ x: frame.d[0], y: frame.d[1], h: frame.d[2] })
          if (trail.length > 16) trail.shift()
        }

        render(ctx, frame, meta, view, {
          localId: session.localId,
          aim: ptr.world,
          trail,
          time: now / 1000,
          font,
        })

        const snap = snapshot(session, frame, meta)
        const key = JSON.stringify(snap)
        if (key !== hudKeyRef.current) {
          hudKeyRef.current = key
          setHud(snap)
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (MOVE_KEYS[e.code]) {
        e.preventDefault()
        keysRef.current.add(e.code)
      } else if (e.code === 'Space') {
        e.preventDefault()
        pendingRef.current.dive = true
      } else if (e.code === 'KeyQ' || e.code === 'Tab') {
        e.preventDefault()
        pendingRef.current.switchPlayer = true
      } else if (e.code === 'KeyP' || e.code === 'Escape') {
        togglePause()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.code)
    const onBlur = () => keysRef.current.clear()
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [session, togglePause])

  const pointerWorld = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const view = viewRef.current
    if (!view) return null
    const rect = e.currentTarget.getBoundingClientRect()
    return toWorld(view, e.clientX - rect.left, e.clientY - rect.top)
  }

  const isHolding = () => {
    const cur = latestRef.current
    return !!cur && localHolding(cur.frame, cur.meta, session.localId)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // capture can fail for synthetic or already-released pointers
    }
    pointerRef.current.down = true
    pointerRef.current.startedHolding = isHolding()
    pointerRef.current.world = pointerWorld(e)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointerRef.current.world = pointerWorld(e)
  }

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ptr = pointerRef.current
    ptr.world = pointerWorld(e)
    if (ptr.down && ptr.startedHolding && isHolding() && !session.paused && ptr.world) {
      pendingRef.current.throwAt = ptr.world
    }
    ptr.down = false
    ptr.startedHolding = false
    if (e.pointerType !== 'mouse') ptr.world = null
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <Scoreboard hud={hud} onPause={togglePause} />
      <div
        ref={wrapRef}
        className="relative h-[calc(100svh-15rem)] min-h-96 w-full overflow-hidden rounded-xl border border-border bg-background md:h-auto md:min-h-0 md:aspect-[3.1/1]"
      >
        <canvas
          ref={canvasRef}
          tabIndex={0}
          aria-label="Ultimate frisbee field. Aim with the pointer and release to throw. Use arrow keys or WASD to move, Space to lay out."
          className="absolute inset-0 h-full w-full cursor-crosshair touch-none outline-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse' && !pointerRef.current.down) pointerRef.current.world = null
          }}
        />
        <GameOverlay
          hud={hud}
          onRematch={() => session.start()}
          onLobby={() => session.backToLobby()}
          onLeave={onLeave}
          onResume={togglePause}
          onSkip={requestSkip}
        />
      </div>
      <ControlsBar hud={hud} onDive={requestDive} onSwitch={requestSwitch} />
    </div>
  )
}
