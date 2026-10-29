import { EZ, FIELD_L, FIELD_W, PER_TEAM, STALL_MAX, clampThrow } from './engine'
import { POSE_STRIDE, type Frame, type Meta } from './frame'

export const COLORS = {
  bg: '#0f2417',
  grass: '#3f8a3c',
  chalk: '#f4f1e6',
  home: '#ff6b1a',
  away: '#7fd3f5',
}

export interface View {
  s: number
  ox: number
  oy: number
  rotated: boolean
  dpr: number
  w: number
  h: number
}

export interface Camera {
  cx: number
  cy: number
  z: number
}

export const DEFAULT_CAMERA: Camera = { cx: FIELD_L / 2, cy: FIELD_W / 2, z: 1 }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

export function computeView(w: number, h: number, dpr: number, cam: Camera = DEFAULT_CAMERA): View {
  const rotated = h > w * 1.15
  const W = rotated ? FIELD_W : FIELD_L
  const H = rotated ? FIELD_L : FIELD_W
  const m = 3
  const s = Math.min(w / (W + m * 2), h / (H + m * 2)) * cam.z
  const halfX = (rotated ? h : w) / 2 / s
  const halfY = (rotated ? w : h) / 2 / s
  const cx = halfX * 2 >= FIELD_L + m * 2 ? FIELD_L / 2 : clamp(cam.cx, halfX - m, FIELD_L - halfX + m)
  const cy = halfY * 2 >= FIELD_W + m * 2 ? FIELD_W / 2 : clamp(cam.cy, halfY - m, FIELD_W - halfY + m)
  const ox = rotated ? w / 2 - cy * s : w / 2 - cx * s
  const oy = rotated ? h / 2 - (FIELD_L - cx) * s : h / 2 - cy * s
  return { s, ox, oy, rotated, dpr, w, h }
}

export function toWorld(v: View, sx: number, sy: number) {
  if (!v.rotated) return { x: (sx - v.ox) / v.s, y: (sy - v.oy) / v.s }
  return { x: FIELD_L - (sy - v.oy) / v.s, y: (sx - v.ox) / v.s }
}

export function screenDirToWorld(v: View, dx: number, dy: number) {
  return v.rotated ? { x: -dy, y: dx } : { x: dx, y: dy }
}

function applyWorld(ctx: CanvasRenderingContext2D, v: View) {
  const k = v.dpr * v.s
  if (!v.rotated) ctx.setTransform(k, 0, 0, k, v.ox * v.dpr, v.oy * v.dpr)
  else ctx.setTransform(0, -k, k, 0, v.ox * v.dpr, (v.oy + FIELD_L * v.s) * v.dpr)
}

function alpha(hex: string, a: number) {
  const n = Number.parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

function drawField(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = alpha(COLORS.grass, 0.78)
  ctx.fillRect(-40, -40, FIELD_L + 80, FIELD_W + 80)
  for (let i = 0; i < FIELD_L / 10; i++) {
    ctx.fillStyle = COLORS.grass
    ctx.fillRect(i * 10, 0, 10, FIELD_W)
    if (i % 2 === 0) {
      ctx.fillStyle = alpha(COLORS.chalk, 0.045)
      ctx.fillRect(i * 10, 0, 10, FIELD_W)
    }
  }
  ctx.fillStyle = alpha(COLORS.away, 0.13)
  ctx.fillRect(0, 0, EZ, FIELD_W)
  ctx.fillStyle = alpha(COLORS.home, 0.13)
  ctx.fillRect(FIELD_L - EZ, 0, EZ, FIELD_W)

  ctx.strokeStyle = alpha(COLORS.chalk, 0.85)
  ctx.lineWidth = 0.3
  ctx.strokeRect(0, 0, FIELD_L, FIELD_W)
  ctx.beginPath()
  ctx.moveTo(EZ, 0)
  ctx.lineTo(EZ, FIELD_W)
  ctx.moveTo(FIELD_L - EZ, 0)
  ctx.lineTo(FIELD_L - EZ, FIELD_W)
  ctx.stroke()

  ctx.lineWidth = 0.25
  for (const bx of [EZ + 20, FIELD_L - EZ - 20]) {
    ctx.beginPath()
    ctx.moveTo(bx - 0.7, FIELD_W / 2 - 0.7)
    ctx.lineTo(bx + 0.7, FIELD_W / 2 + 0.7)
    ctx.moveTo(bx + 0.7, FIELD_W / 2 - 0.7)
    ctx.lineTo(bx - 0.7, FIELD_W / 2 + 0.7)
    ctx.stroke()
  }
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  v: View,
  x: number,
  y: number,
  text: string,
  color: string,
  font: string,
  below: boolean,
) {
  ctx.save()
  ctx.translate(x, y)
  if (v.rotated) ctx.rotate(Math.PI / 2)
  ctx.scale(0.06, 0.06)
  ctx.font = `700 26px ${font}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const w = ctx.measureText(text).width
  const cy = below ? 42 : -42
  ctx.fillStyle = alpha(COLORS.bg, 0.8)
  ctx.beginPath()
  ctx.roundRect(-w / 2 - 9, cy - 18, w + 18, 36, 10)
  ctx.fill()
  ctx.fillStyle = color
  ctx.fillText(text, 0, cy + 1)
  ctx.restore()
}

export interface RenderOptions {
  localId: string
  aim: { x: number; y: number } | null
  trail: { x: number; y: number; h: number }[]
  time: number
  font: string
}

export function localHolding(frame: Frame, meta: Meta, localId: string) {
  if (meta.phase !== 'play' || frame.holder < 0) return false
  return meta.humans.some((h) => h.id === localId && h.controlled === frame.holder)
}

export function render(ctx: CanvasRenderingContext2D, frame: Frame, meta: Meta, v: View, o: RenderOptions) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, v.w * v.dpr, v.h * v.dpr)
  applyWorld(ctx, v)
  drawField(ctx)

  const up = v.rotated ? { x: 1, y: 0 } : { x: 0, y: -1 }
  const live = meta.phase === 'play'
  const showHumans = meta.phase === 'play' || meta.phase === 'scored' || meta.phase === 'over'
  const count = frame.p.length / POSE_STRIDE
  const at = (i: number) => ({
    x: frame.p[i * POSE_STRIDE],
    y: frame.p[i * POSE_STRIDE + 1],
    dirX: frame.p[i * POSE_STRIDE + 2],
    dirY: frame.p[i * POSE_STRIDE + 3],
    down: frame.p[i * POSE_STRIDE + 4] === 1,
  })

  if (frame.land) {
    const [ex, ey] = frame.land
    ctx.strokeStyle = alpha(COLORS.chalk, 0.5)
    ctx.lineWidth = 0.22
    ctx.beginPath()
    ctx.moveTo(ex - 0.7, ey - 0.7)
    ctx.lineTo(ex + 0.7, ey + 0.7)
    ctx.moveTo(ex + 0.7, ey - 0.7)
    ctx.lineTo(ex - 0.7, ey + 0.7)
    ctx.stroke()
  }

  if (o.aim && localHolding(frame, meta, o.localId)) {
    const h = at(frame.holder)
    const t = clampThrow(h.x, h.y, o.aim)
    ctx.setLineDash([0.9, 0.7])
    ctx.lineDashOffset = -o.time * 4
    ctx.strokeStyle = alpha(COLORS.chalk, t.clamped ? 0.45 : 0.75)
    ctx.lineWidth = 0.22
    ctx.beginPath()
    ctx.moveTo(h.x, h.y)
    ctx.lineTo(t.x, t.y)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.arc(t.x, t.y, 1.3, 0, Math.PI * 2)
    ctx.strokeStyle = t.clamped ? COLORS.home : COLORS.chalk
    ctx.lineWidth = 0.25
    ctx.stroke()
  }

  for (let i = 0; i < count; i++) {
    const p = at(i)
    ctx.fillStyle = alpha(COLORS.bg, 0.3)
    ctx.beginPath()
    ctx.ellipse(p.x + 0.25, p.y + 0.3, 1.05, 1.05, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  for (let i = 0; i < count; i++) {
    const p = at(i)
    ctx.fillStyle = i < PER_TEAM ? COLORS.home : COLORS.away
    ctx.strokeStyle = COLORS.bg
    ctx.lineWidth = 0.18
    ctx.beginPath()
    if (p.down) ctx.ellipse(p.x, p.y, 1.45, 0.75, Math.atan2(p.dirY, p.dirX), 0, Math.PI * 2)
    else ctx.arc(p.x, p.y, 0.95, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = COLORS.bg
    ctx.beginPath()
    ctx.arc(p.x + p.dirX * 0.5, p.y + p.dirY * 0.5, 0.2, 0, Math.PI * 2)
    ctx.fill()
  }

  if (showHumans) {
    for (const h of meta.humans) {
      const p = at(h.controlled)
      const mine = h.id === o.localId
      if (mine && h.controlled !== frame.holder) {
        ctx.setLineDash([0.6, 0.45])
        ctx.lineDashOffset = o.time * 2
        ctx.strokeStyle = COLORS.chalk
        ctx.lineWidth = 0.22
        ctx.beginPath()
        ctx.arc(p.x, p.y, 1.75, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
      } else if (!mine) {
        ctx.strokeStyle = alpha(COLORS.chalk, 0.55)
        ctx.lineWidth = 0.14
        ctx.beginPath()
        ctx.arc(p.x, p.y, 1.55, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
  }

  if (frame.holder >= 0 && live) {
    const h = at(frame.holder)
    const frac = Math.min(frame.stall / STALL_MAX, 1)
    ctx.strokeStyle = alpha(COLORS.chalk, 0.25)
    ctx.lineWidth = 0.3
    ctx.beginPath()
    ctx.arc(h.x, h.y, 1.6, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = frac > 0.7 ? COLORS.home : COLORS.chalk
    ctx.beginPath()
    ctx.arc(h.x, h.y, 1.6, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2)
    ctx.stroke()
  }

  if (o.trail.length > 1) {
    ctx.lineCap = 'round'
    for (let i = 1; i < o.trail.length; i++) {
      const a = o.trail[i - 1]
      const b = o.trail[i]
      ctx.strokeStyle = alpha(COLORS.chalk, (i / o.trail.length) * 0.35)
      ctx.lineWidth = 0.35 * (i / o.trail.length)
      ctx.beginPath()
      ctx.moveTo(a.x + up.x * a.h * 0.55, a.y + up.y * a.h * 0.55)
      ctx.lineTo(b.x + up.x * b.h * 0.55, b.y + up.y * b.h * 0.55)
      ctx.stroke()
    }
    ctx.lineCap = 'butt'
  }

  const [dxw, dyw, dh] = frame.d
  ctx.fillStyle = alpha(COLORS.bg, 0.35)
  ctx.beginPath()
  ctx.ellipse(dxw, dyw, 0.5, 0.5, 0, 0, Math.PI * 2)
  ctx.fill()
  const dx = dxw + up.x * dh * 0.55
  const dy = dyw + up.y * dh * 0.55
  const r = 0.5 * (1 + dh * 0.07)
  ctx.fillStyle = COLORS.chalk
  ctx.strokeStyle = COLORS.bg
  ctx.lineWidth = 0.12
  ctx.beginPath()
  ctx.arc(dx, dy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.strokeStyle = alpha(COLORS.bg, 0.35)
  ctx.lineWidth = 0.08
  ctx.beginPath()
  ctx.arc(dx, dy, r * 0.6, 0, Math.PI * 2)
  ctx.stroke()

  if (showHumans && meta.humans.length > 1) {
    const localTeam = meta.humans.find((h) => h.id === o.localId)?.team ?? 'home'
    for (const h of meta.humans) {
      const p = at(h.controlled)
      const mine = h.id === o.localId
      const color = h.team === 'home' ? COLORS.home : COLORS.away
      drawLabel(ctx, v, p.x, p.y, mine ? 'You' : h.name, color, o.font, h.team !== localTeam)
    }
  }
}
