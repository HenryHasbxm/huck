import { snapshotFrame, type Frame, type Meta } from './frame'

export const FIELD_L = 120
export const FIELD_W = 40
export const EZ = 20
export const PER_TEAM = 5
export const STALL_MAX = 10
export const MAX_THROW = 55

const REACH = 1.35
const DIVE_REACH = 2.1
const CATCH_HEIGHT = 2.4
const DIVE_TIME = 0.32
const RECOVER_TIME = 0.55
const ACCEL = 34
const SPEED = { cutter: 9.6, defender: 8.0, user: 10, dive: 15 }
const DEFENSE_REACTION = 2.2
const AI_THROW_ERROR = 0.15
const MARK_CLEARANCE = 3.4

const RECORD_HZ = 30
const HISTORY_FRAMES = 200
const REPLAY_SECONDS = 3.5
const REPLAY_SPEED = 0.55
const CELEBRATE_TIME = 0.9

export type Team = 'home' | 'away'
export const TEAM_NAME: Record<Team, string> = { home: 'Orange', away: 'Blue' }
export const other = (t: Team): Team => (t === 'home' ? 'away' : 'home')
export const attackDir = (t: Team) => (t === 'home' ? 1 : -1)
export const inScoringZone = (t: Team, x: number) => (t === 'home' ? x > FIELD_L - EZ : x < EZ)
export const teamOf = (playerId: number): Team => (playerId < PER_TEAM ? 'home' : 'away')

export interface Player {
  id: number
  team: Team
  markId: number
  x: number
  y: number
  vx: number
  vy: number
  tx: number
  ty: number
  dirX: number
  dirY: number
  cutTimer: number
  diveT: number
  recoverT: number
}

export interface Human {
  id: string
  name: string
  team: Team
  controlled: number
}

export type Disc =
  | { kind: 'held'; holder: number }
  | {
      kind: 'flight'
      thrower: number
      team: Team
      sx: number
      sy: number
      ex: number
      ey: number
      t: number
      dur: number
      peak: number
      curve: number
    }
  | { kind: 'ground'; x: number; y: number; team: Team }

export type Phase = 'menu' | 'play' | 'scored' | 'replay' | 'over'

export interface GameState {
  players: Player[]
  humans: Human[]
  disc: Disc
  discX: number
  discY: number
  discH: number
  score: Record<Team, number>
  stall: number
  phase: Phase
  phaseT: number
  nextReceiving: Team
  message: string | null
  messageTeam: Team | null
  messageT: number
  aiThrowT: number
  target: number
  winner: Team | null
  time: number
  history: Frame[]
  recordAcc: number
  lastThrow: { thrower: number; name: string; dist: number } | null
  pendingCaption: { caption: string; team: Team } | null
  replay: { frames: Frame[]; t: number; caption: string; team: Team } | null
}

export interface InputState {
  move: { x: number; y: number }
  steerTo: { x: number; y: number } | null
  throwAt: { x: number; y: number } | null
  dive: boolean
  switchPlayer: boolean
  skip: boolean
}

export const emptyInput = (): InputState => ({
  move: { x: 0, y: 0 },
  steerTo: null,
  throwAt: null,
  dive: false,
  switchPlayer: false,
  skip: false,
})

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by)
const rand = (a: number, b: number) => a + Math.random() * (b - a)

function makePlayer(id: number, team: Team): Player {
  const markId = team === 'home' ? id + PER_TEAM : id - PER_TEAM
  return { id, team, markId, x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, dirX: 1, dirY: 0, cutTimer: 0, diveT: 0, recoverT: 0 }
}

export function createGame(target = 5): GameState {
  const players: Player[] = []
  for (let i = 0; i < PER_TEAM; i++) players.push(makePlayer(i, 'home'))
  for (let i = 0; i < PER_TEAM; i++) players.push(makePlayer(i + PER_TEAM, 'away'))
  const g: GameState = {
    players,
    humans: [],
    disc: { kind: 'held', holder: 0 },
    discX: 0,
    discY: 0,
    discH: 1,
    score: { home: 0, away: 0 },
    stall: 0,
    phase: 'menu',
    phaseT: 0,
    nextReceiving: 'home',
    message: null,
    messageTeam: null,
    messageT: 0,
    aiThrowT: 1,
    target,
    winner: null,
    time: 0,
    history: [],
    recordAcc: 0,
    lastThrow: null,
    pendingCaption: null,
    replay: null,
  }
  setupPoint(g, 'home')
  g.phase = 'menu'
  return g
}

export function startGame(g: GameState) {
  g.score = { home: 0, away: 0 }
  g.winner = null
  g.replay = null
  setupPoint(g, 'home')
  flash(g, `Pull! ${TEAM_NAME.home} on offense`, null, 1.6)
}

/* ---------- humans ---------- */

export function humanOf(g: GameState, playerId: number) {
  return g.humans.find((h) => h.controlled === playerId)
}

function displayName(g: GameState, playerId: number) {
  return humanOf(g, playerId)?.name ?? `#${(playerId % PER_TEAM) + 1}`
}

function freePlayers(g: GameState, team: Team, exceptHuman?: string) {
  return g.players.filter((p) => p.team === team && !g.humans.some((h) => h.id !== exceptHuman && h.controlled === p.id))
}

export function teamHasRoom(g: GameState, team: Team) {
  return g.humans.filter((h) => h.team === team).length < PER_TEAM
}

export function addHuman(g: GameState, id: string, name: string, team: Team): Human | null {
  removeHuman(g, id)
  let t = team
  if (!teamHasRoom(g, t)) t = other(t)
  if (!teamHasRoom(g, t)) return null
  const free = freePlayers(g, t)
  free.sort((a, b) => dist(a.x, a.y, g.discX, g.discY) - dist(b.x, b.y, g.discX, g.discY))
  const human: Human = { id, name, team: t, controlled: free[0].id }
  g.humans.push(human)
  return human
}

export function removeHuman(g: GameState, id: string) {
  g.humans = g.humans.filter((h) => h.id !== id)
}

function assignHumans(g: GameState, receiving: Team, holder: number) {
  for (const team of ['home', 'away'] as Team[]) {
    const humans = g.humans.filter((h) => h.team === team)
    const order = g.players
      .filter((p) => p.team === team)
      .sort((a, b) => {
        const key = (p: Player) => (team === receiving ? (p.id === holder ? -1 : p.id) : p.markId === holder ? -1 : p.id)
        return key(a) - key(b)
      })
    humans.forEach((h, i) => (h.controlled = order[i].id))
  }
}

function retarget(g: GameState, team: Team, x: number, y: number, exclude = -1, prefer?: Human) {
  const humans = g.humans.filter((h) => h.team === team)
  if (!humans.length) return
  const pid = nearest(g, team, x, y, exclude)
  if (pid < 0 || humans.some((h) => h.controlled === pid)) return
  if (prefer && prefer.team === team) {
    prefer.controlled = pid
    return
  }
  const target = g.players[pid]
  let best = humans[0]
  let bestD = Infinity
  for (const h of humans) {
    const p = g.players[h.controlled]
    const d = dist(p.x, p.y, target.x, target.y)
    if (d < bestD) {
      bestD = d
      best = h
    }
  }
  best.controlled = pid
}

function retargetDefense(g: GameState, team: Team, x: number, y: number) {
  if (g.humans.filter((h) => h.team === team).length === 1) retarget(g, team, x, y)
}

/* ---------- helpers ---------- */

function teamPlayers(g: GameState, team: Team) {
  return g.players.filter((p) => p.team === team)
}

function nearest(g: GameState, team: Team, x: number, y: number, exclude = -1) {
  let best = -1
  let bestD = Infinity
  for (const p of g.players) {
    if (p.team !== team || p.id === exclude) continue
    const d = dist(p.x, p.y, x, y)
    if (d < bestD) {
      bestD = d
      best = p.id
    }
  }
  return best
}

function flash(g: GameState, msg: string, team: Team | null, t = 1.4) {
  g.message = msg
  g.messageTeam = team
  g.messageT = t
}

export function setupPoint(g: GameState, receiving: Team) {
  const dir = attackDir(receiving)
  const startX = receiving === 'home' ? EZ : FIELD_L - EZ
  const off = teamPlayers(g, receiving)
  off.forEach((p, k) => {
    const x = k === 0 ? startX : startX + dir * (8 + k * 5)
    const y = k === 0 ? FIELD_W / 2 : FIELD_W / 2 + (k % 2 ? -2.5 : 2.5)
    Object.assign(p, { x, y, vx: 0, vy: 0, tx: x, ty: y, dirX: dir, dirY: 0, cutTimer: rand(0.3, 1.2), diveT: 0, recoverT: 0 })
  })
  for (const p of teamPlayers(g, other(receiving))) {
    const m = g.players[p.markId]
    const x = m.x + dir * 2
    Object.assign(p, { x, y: m.y, vx: 0, vy: 0, tx: x, ty: m.y, dirX: -dir, dirY: 0, cutTimer: 0, diveT: 0, recoverT: 0 })
  }
  g.disc = { kind: 'held', holder: off[0].id }
  g.stall = 0
  g.aiThrowT = rand(1.2, 2)
  g.phase = 'play'
  g.history = []
  g.recordAcc = 0
  g.lastThrow = null
  g.replay = null
  assignHumans(g, receiving, off[0].id)
  syncDisc(g)
}

function possessingTeam(g: GameState): Team {
  const d = g.disc
  return d.kind === 'held' ? g.players[d.holder].team : d.team
}

function holderId(g: GameState) {
  return g.disc.kind === 'held' ? g.disc.holder : -1
}

export function clampThrow(fromX: number, fromY: number, to: { x: number; y: number }) {
  const dx = to.x - fromX
  const dy = to.y - fromY
  const d = Math.hypot(dx, dy)
  if (d <= MAX_THROW) return { x: to.x, y: to.y, clamped: false }
  return { x: fromX + (dx / d) * MAX_THROW, y: fromY + (dy / d) * MAX_THROW, clamped: true }
}

function pastMark(d: Extract<Disc, { kind: 'flight' }>) {
  return d.t * dist(d.sx, d.sy, d.ex, d.ey) > MARK_CLEARANCE
}

function flightDuration(d: number) {
  return 0.3 + d / 34
}

/* ---------- disc events ---------- */

function throwDisc(g: GameState, thrower: number, tx: number, ty: number) {
  const p = g.players[thrower]
  const d = dist(p.x, p.y, tx, ty)
  if (d < 2) return false
  g.disc = {
    kind: 'flight',
    thrower,
    team: p.team,
    sx: p.x,
    sy: p.y,
    ex: tx,
    ey: ty,
    t: 0,
    dur: flightDuration(d),
    peak: 0.8 + d * 0.055,
    curve: (Math.random() < 0.5 ? -1 : 1) * d * 0.05,
  }
  g.stall = 0
  g.lastThrow = { thrower, name: displayName(g, thrower), dist: d }
  retarget(g, p.team, tx, ty, thrower, humanOf(g, thrower))
  retargetDefense(g, other(p.team), tx, ty)
  return true
}

function giveDisc(g: GameState, id: number) {
  const p = g.players[id]
  g.disc = { kind: 'held', holder: id }
  g.stall = 0
  p.vx = p.vy = 0
  p.diveT = p.recoverT = 0
  g.aiThrowT = rand(0.9, 2)
  retarget(g, p.team, p.x, p.y)
  retargetDefense(g, other(p.team), p.x, p.y)
  for (const q of g.players) if (q.team === p.team) q.cutTimer = rand(0, 0.4)
}

function scorePoint(g: GameState, team: Team, catcher: number, callahan: boolean, dove: boolean) {
  g.score[team]++
  g.disc = { kind: 'held', holder: catcher }
  g.nextReceiving = other(team)
  g.phase = 'scored'
  g.phaseT = CELEBRATE_TIME
  if (g.score[team] >= g.target) g.winner = team

  const catcherName = displayName(g, catcher)
  const lt = g.lastThrow
  let caption: string
  if (callahan) caption = `Callahan! ${catcherName} picks it off in the end zone`
  else if (lt) caption = `${lt.name} ${lt.dist > 35 ? 'hucks' : 'hits'} ${catcherName} — ${Math.round(lt.dist)} yd${dove ? ', layout!' : ''}`
  else caption = `${catcherName} scores`
  g.pendingCaption = { caption, team }
  flash(g, `${TEAM_NAME[team]} scores!`, team, CELEBRATE_TIME + 0.2)
}

function turnover(g: GameState, x: number, y: number, team: Team, msg: string) {
  let cx = clamp(x, 0.5, FIELD_L - 0.5)
  const cy = clamp(y, 0.5, FIELD_W - 0.5)
  cx = team === 'home' ? Math.min(cx, FIELD_L - EZ) : Math.max(cx, EZ)
  g.disc = { kind: 'ground', x: cx, y: cy, team }
  g.stall = 0
  retarget(g, team, cx, cy)
  retargetDefense(g, other(team), cx, cy)
  flash(g, msg, team)
}

function catchDisc(g: GameState, id: number, team: Team) {
  const p = g.players[id]
  const intercepted = p.team !== team
  const dove = p.diveT > 0
  if (inScoringZone(p.team, p.x)) {
    scorePoint(g, p.team, id, intercepted, dove)
    return
  }
  const human = humanOf(g, id)
  if (intercepted) {
    flash(g, human ? `${human.name} with the ${dove ? 'layout ' : ''}D!` : dove ? 'Layout D!' : 'Interception!', p.team)
  } else if (dove) {
    flash(g, human ? `Layout grab by ${human.name}!` : 'Layout grab!', p.team, 1.1)
  }
  giveDisc(g, id)
}

/* ---------- AI ---------- */

function simulateRisk(g: GameState, team: Team, sx: number, sy: number, tx: number, ty: number) {
  const d = dist(sx, sy, tx, ty)
  const dur = flightDuration(d)
  const peak = 0.8 + d * 0.055
  let margin = Infinity
  for (let t = Math.min(0.9, MARK_CLEARANCE / d); t <= 1.001; t += 0.08) {
    const h = peak * Math.sin(Math.PI * t) + (1 - t)
    if (h >= CATCH_HEIGHT) continue
    const px = sx + (tx - sx) * t
    const py = sy + (ty - sy) * t
    for (const o of g.players) {
      if (o.team === team) continue
      const reachT = Math.max(0, dist(o.x, o.y, px, py) - REACH - 0.5) / SPEED.defender
      margin = Math.min(margin, reachT - t * dur)
    }
  }
  return { margin, dur }
}

function aiTryThrow(g: GameState, hid: number) {
  const h = g.players[hid]
  const dir = attackDir(h.team)
  let best: { x: number; y: number } | null = null
  let bestScore = -Infinity
  const desperate = g.stall > 7.5
  for (const m of g.players) {
    if (m.team !== h.team || m.id === hid) continue
    for (const lead of [0.5, 1]) {
      const d0 = dist(m.x, m.y, h.x, h.y)
      const est = flightDuration(d0)
      const tx = clamp(m.x + m.vx * est * lead, 1, FIELD_L - 1)
      const ty = clamp(m.y + m.vy * est * lead, 1.5, FIELD_W - 1.5)
      const d = dist(tx, ty, h.x, h.y)
      if (d < 4 || d > MAX_THROW * 0.85) continue
      const { margin, dur } = simulateRisk(g, h.team, h.x, h.y, tx, ty)
      const recv = dist(m.x, m.y, tx, ty) / SPEED.cutter
      if (recv > dur + 0.15) continue
      if (margin < 0.05 - g.stall * 0.05 && !desperate) continue
      const progress = dir * (tx - h.x)
      const score = progress * 0.9 + (inScoringZone(h.team, tx) ? 18 : 0) + clamp(margin, -2, 2) * 10 + Math.random() * 2
      if (score > bestScore) {
        bestScore = score
        best = { x: tx, y: ty }
      }
    }
  }
  if (best && (bestScore > 2 || desperate || g.stall > 4)) {
    const err = dist(h.x, h.y, best.x, best.y) * AI_THROW_ERROR
    throwDisc(g, hid, best.x + rand(-err, err), best.y + rand(-err, err))
  } else g.aiThrowT = 0.25
}

function pickCut(g: GameState, p: Player, ax: number, ay: number) {
  const dir = attackDir(p.team)
  const mates = g.players.filter((q) => q.team === p.team && q.id !== p.id)
  let tx = 0
  let ty = 0
  for (let tries = 0; tries < 4; tries++) {
    const under = Math.random() < 0.3
    const ahead = under ? rand(5, 11) : rand(12, 34)
    tx = clamp(ax + dir * ahead, 3, FIELD_L - 3)
    ty = rand(4, FIELD_W - 4)
    if (Math.abs(ty - ay) < 4) ty = clamp(ty + (ty > ay ? 6 : -6), 3, FIELD_W - 3)
    if (mates.every((q) => dist(q.tx, q.ty, tx, ty) > 7)) break
  }
  p.tx = tx
  p.ty = ty
  p.cutTimer = rand(1.3, 2.9)
}

function assignTargets(g: GameState, dt: number) {
  const d = g.disc
  const poss = possessingTeam(g)
  const hid = holderId(g)
  const anchor = d.kind === 'held' ? g.players[d.holder] : d.kind === 'ground' ? d : { x: d.ex, y: d.ey }

  const flightRunner = { home: -1, away: -1 }
  if (d.kind === 'flight') {
    flightRunner.home = nearest(g, 'home', d.ex, d.ey, d.thrower)
    flightRunner.away = nearest(g, 'away', d.ex, d.ey, d.thrower)
  }
  const groundRunner = d.kind === 'ground' ? nearest(g, d.team, d.x, d.y) : -1

  for (const p of g.players) {
    if (p.id === hid) continue
    if (d.kind === 'flight' && p.id === flightRunner[p.team]) {
      p.tx = d.ex
      p.ty = d.ey
      continue
    }
    if (p.team === poss) {
      if (p.id === groundRunner && d.kind === 'ground') {
        p.tx = d.x
        p.ty = d.y
        continue
      }
      p.cutTimer -= dt
      if (p.cutTimer <= 0 || dist(p.x, p.y, p.tx, p.ty) < 1) pickCut(g, p, anchor.x, anchor.y)
    } else {
      const m = g.players[p.markId]
      const offDir = attackDir(poss)
      if (m.id === hid) {
        p.tx = m.x + offDir * 1.8
        p.ty = m.y
      } else {
        const ix = m.x + offDir * 1.6
        const iy = m.y + (g.discY - m.y) * 0.1
        const k = Math.min(1, dt * DEFENSE_REACTION)
        p.tx += (ix - p.tx) * k
        p.ty += (iy - p.ty) * k
      }
    }
  }
}

/* ---------- movement ---------- */

function startDive(p: Player, dx: number, dy: number) {
  const l = Math.hypot(dx, dy) || 1
  p.dirX = dx / l
  p.dirY = dy / l
  p.vx = p.dirX * SPEED.dive
  p.vy = p.dirY * SPEED.dive
  p.diveT = DIVE_TIME
}

const isManual = (input: InputState | undefined) => !!input && (input.move.x !== 0 || input.move.y !== 0 || !!input.steerTo)

function movePlayers(g: GameState, inputs: Map<string, InputState> | null, dt: number) {
  const hid = holderId(g)
  const poss = possessingTeam(g)
  const d = g.disc
  const live = g.phase === 'play'

  for (const p of g.players) {
    if (p.id === hid && live) {
      p.vx = p.vy = 0
      continue
    }
    if (p.recoverT > 0) {
      p.recoverT -= dt
      p.vx *= 0.8
      p.vy *= 0.8
      p.x += p.vx * dt
      p.y += p.vy * dt
      continue
    }
    if (p.diveT > 0) {
      p.diveT -= dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      if (p.diveT <= 0) p.recoverT = RECOVER_TIME
      continue
    }

    const human = live && inputs ? humanOf(g, p.id) : undefined
    const input = human ? inputs?.get(human.id) : undefined
    const manual = isManual(input)
    const speed = manual ? SPEED.user : p.team === poss ? SPEED.cutter : SPEED.defender
    let dvx = 0
    let dvy = 0

    if (!live) {
      // players coast to a stop while celebrating
    } else if (manual && input) {
      if (input.steerTo) {
        const dx = input.steerTo.x - p.x
        const dy = input.steerTo.y - p.y
        const l = Math.hypot(dx, dy)
        const s = Math.min(speed, l * 4)
        if (l > 0.05) {
          dvx = (dx / l) * s
          dvy = (dy / l) * s
        }
      } else {
        dvx = input.move.x * speed
        dvy = input.move.y * speed
      }
    } else {
      const dx = p.tx - p.x
      const dy = p.ty - p.y
      const l = Math.hypot(dx, dy)
      const s = Math.min(speed, l * 3)
      if (l > 0.05) {
        dvx = (dx / l) * s
        dvy = (dy / l) * s
      }
    }

    const ax = dvx - p.vx
    const ay = dvy - p.vy
    const al = Math.hypot(ax, ay)
    const maxA = ACCEL * dt
    if (al > maxA && al > 0) {
      p.vx += (ax / al) * maxA
      p.vy += (ay / al) * maxA
    } else {
      p.vx = dvx
      p.vy = dvy
    }
    p.x = clamp(p.x + p.vx * dt, -3, FIELD_L + 3)
    p.y = clamp(p.y + p.vy * dt, -3, FIELD_W + 3)
    const sp = Math.hypot(p.vx, p.vy)
    if (sp > 0.6) {
      p.dirX = p.vx / sp
      p.dirY = p.vy / sp
    }

    const chasing = d.kind === 'flight' && p.tx === d.ex && p.ty === d.ey
    if (live && d.kind === 'flight' && chasing && !manual && g.discH < CATCH_HEIGHT && pastMark(d)) {
      const dd = dist(p.x, p.y, g.discX, g.discY)
      if (dd > REACH * 0.9 && dd < DIVE_REACH * 0.95 && p.id !== d.thrower) {
        startDive(p, g.discX - p.x, g.discY - p.y)
      }
    }
  }
}

function separate(g: GameState) {
  const hid = holderId(g)
  const ps = g.players
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i]
      const b = ps[j]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const l = Math.hypot(dx, dy)
      const min = 1.5
      if (l >= min || l === 0) continue
      const push = min - l
      const nx = dx / l
      const ny = dy / l
      const wa = a.id === hid ? 0 : b.id === hid ? 1 : 0.5
      const wb = 1 - wa
      a.x -= nx * push * wa
      a.y -= ny * push * wa
      b.x += nx * push * wb
      b.y += ny * push * wb
    }
  }
}

function syncDisc(g: GameState) {
  const d = g.disc
  if (d.kind === 'held') {
    const h = g.players[d.holder]
    g.discX = h.x + h.dirX * 0.7
    g.discY = h.y + h.dirY * 0.7
    g.discH = 1
  } else if (d.kind === 'ground') {
    g.discX = d.x
    g.discY = d.y
    g.discH = 0
  } else {
    const t = Math.min(d.t, 1)
    const lx = d.sx + (d.ex - d.sx) * t
    const ly = d.sy + (d.ey - d.sy) * t
    const len = Math.hypot(d.ex - d.sx, d.ey - d.sy) || 1
    const nx = -(d.ey - d.sy) / len
    const ny = (d.ex - d.sx) / len
    const c = Math.sin(Math.PI * t) * d.curve
    g.discX = lx + nx * c
    g.discY = ly + ny * c
    g.discH = d.peak * Math.sin(Math.PI * t) + (1 - t)
  }
}

function updateDisc(g: GameState, inputs: Map<string, InputState>, dt: number) {
  const d = g.disc
  if (d.kind === 'held') {
    g.stall += dt
    const h = g.players[d.holder]
    if (g.stall >= STALL_MAX) {
      turnover(g, h.x, h.y, other(h.team), `Stalled — ${TEAM_NAME[other(h.team)]} disc`)
      return
    }
    const human = humanOf(g, d.holder)
    if (human) {
      const throwAt = inputs.get(human.id)?.throwAt
      if (throwAt) {
        const t = clampThrow(h.x, h.y, throwAt)
        throwDisc(g, d.holder, t.x, t.y)
      }
    } else {
      g.aiThrowT -= dt
      if (g.aiThrowT <= 0) aiTryThrow(g, d.holder)
    }
  } else if (d.kind === 'flight') {
    d.t += dt / d.dur
    syncDisc(g)
    if (pastMark(d) && g.discH < CATCH_HEIGHT) {
      let best = -1
      let bestD = Infinity
      for (const p of g.players) {
        if (p.id === d.thrower || p.recoverT > 0) continue
        const reach = p.diveT > 0 ? DIVE_REACH : REACH
        const dd = dist(p.x, p.y, g.discX, g.discY)
        if (dd < reach && dd < bestD) {
          bestD = dd
          best = p.id
        }
      }
      if (best >= 0) {
        catchDisc(g, best, d.team)
        return
      }
    }
    if (d.t >= 1) {
      const out = d.ex < 0 || d.ex > FIELD_L || d.ey < 0 || d.ey > FIELD_W
      const gain = other(d.team)
      turnover(g, d.ex, d.ey, gain, `${out ? 'Out of bounds' : 'Turnover'} — ${TEAM_NAME[gain]} disc`)
    }
  } else {
    const pid = nearest(g, d.team, d.x, d.y)
    if (pid >= 0 && dist(g.players[pid].x, g.players[pid].y, d.x, d.y) < 0.9) {
      g.players[pid].x = d.x
      g.players[pid].y = d.y
      giveDisc(g, pid)
    }
  }
}

function handleUserActions(g: GameState, inputs: Map<string, InputState>) {
  const hid = holderId(g)
  for (const h of g.humans) {
    const input = inputs.get(h.id)
    if (!input) continue
    if (input.switchPlayer && h.controlled !== hid) {
      const options = freePlayers(g, h.team, h.id).filter((p) => p.id !== hid)
      const idx = options.findIndex((p) => p.id === h.controlled)
      if (options.length) h.controlled = options[(idx + 1) % options.length].id
    }
    const p = g.players[h.controlled]
    if (input.dive && p.id !== hid && p.diveT <= 0 && p.recoverT <= 0) {
      let dx = input.move.x
      let dy = input.move.y
      if (input.steerTo) {
        dx = input.steerTo.x - p.x
        dy = input.steerTo.y - p.y
      }
      if (dx === 0 && dy === 0) {
        dx = g.discX - p.x
        dy = g.discY - p.y
      }
      startDive(p, dx, dy)
    }
  }
}

function record(g: GameState, dt: number) {
  g.recordAcc += dt
  while (g.recordAcc >= 1 / RECORD_HZ) {
    g.recordAcc -= 1 / RECORD_HZ
    g.history.push(snapshotFrame(g))
    if (g.history.length > HISTORY_FRAMES) g.history.shift()
  }
}

function endReplay(g: GameState) {
  g.replay = null
  if (g.winner) {
    g.phase = 'over'
    flash(g, `${TEAM_NAME[g.winner]} wins!`, g.winner, 3)
    return
  }
  setupPoint(g, g.nextReceiving)
  flash(g, `${TEAM_NAME[g.nextReceiving]} on offense`, g.nextReceiving, 1.4)
}

export function update(g: GameState, inputs: Map<string, InputState>, dt: number) {
  if (!(dt > 0)) return
  g.time += dt
  if (g.messageT > 0) {
    g.messageT -= dt
    if (g.messageT <= 0) g.message = null
  }

  if (g.phase === 'replay' && g.replay) {
    const skip = [...inputs.values()].some((i) => i.skip)
    g.replay.t += dt * REPLAY_SPEED
    if (skip || g.replay.t * RECORD_HZ >= g.replay.frames.length - 1) endReplay(g)
    return
  }

  if (g.phase === 'scored') {
    g.phaseT -= dt
    movePlayers(g, null, dt)
    syncDisc(g)
    record(g, dt)
    if (g.phaseT <= 0) {
      const frames = g.history.slice(-Math.round((REPLAY_SECONDS + CELEBRATE_TIME) * RECORD_HZ))
      const cap = g.pendingCaption ?? { caption: '', team: g.nextReceiving }
      g.replay = { frames, t: 0, caption: cap.caption, team: cap.team }
      g.phase = 'replay'
      g.message = null
    }
    return
  }
  if (g.phase !== 'play') return

  handleUserActions(g, inputs)
  updateDisc(g, inputs, dt)
  if (g.phase === 'play') {
    assignTargets(g, dt)
    movePlayers(g, inputs, dt)
    separate(g)
  }
  syncDisc(g)
  record(g, dt)
}

export function currentFrame(g: GameState): Frame {
  if (g.phase === 'replay' && g.replay) {
    const i = Math.min(g.replay.frames.length - 1, Math.floor(g.replay.t * RECORD_HZ))
    return g.replay.frames[i] ?? snapshotFrame(g)
  }
  return snapshotFrame(g)
}

export function currentMeta(g: GameState): Meta {
  const r = g.replay
  return {
    phase: g.phase,
    score: { ...g.score },
    target: g.target,
    stall: g.disc.kind === 'held' && g.phase === 'play' ? Math.min(STALL_MAX, Math.floor(g.stall) + 1) : 0,
    possession: possessingTeam(g),
    message: g.message,
    messageTeam: g.messageTeam,
    winner: g.winner,
    humans: g.humans.map((h) => ({ ...h })),
    replay: r ? { caption: r.caption, team: r.team, progress: Math.min(1, (r.t * RECORD_HZ) / Math.max(1, r.frames.length - 1)) } : null,
  }
}

