import type { DataConnection, Peer as PeerType } from 'peerjs'
import {
  addHuman,
  createGame,
  currentFrame,
  currentMeta,
  emptyInput,
  removeHuman,
  startGame,
  teamHasRoom,
  update,
  type GameState,
  type InputState,
  type Team,
} from './engine'
import { lerpFrame, type Frame, type Meta } from './frame'

export type Mode = 'solo' | 'host' | 'client'

export interface LobbyPlayer {
  id: string
  name: string
  team: Team
}

export interface LobbyInfo {
  status: 'connecting' | 'lobby' | 'playing' | 'error' | 'closed'
  code: string | null
  players: LobbyPlayer[]
  target: number
  error?: string
}

export interface Session {
  readonly mode: Mode
  readonly isHost: boolean
  localId: string
  paused: boolean
  update(dt: number, input: InputState): void
  current(now: number): { frame: Frame; meta: Meta } | null
  setTeam(team: Team): void
  setTarget(target: number): void
  start(): void
  backToLobby(): void
  destroy(): void
}

type ClientMsg =
  | { t: 'hello'; name: string }
  | { t: 'i'; move: InputState['move']; steerTo: InputState['steerTo'] }
  | { t: 'a'; k: 'throw'; x: number; y: number }
  | { t: 'a'; k: 'dive' | 'switch' | 'skip' }
  | { t: 'team'; team: Team }

type HostMsg =
  | { t: 'welcome'; id: string }
  | { t: 'lobby'; info: LobbyInfo; started: boolean }
  | { t: 'f'; f: Frame; m: Meta }

const PREFIX = 'huck-ultimate-v1-'
const SEND_INTERVAL = 1 / 30
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function makeCode() {
  let s = ''
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  return s
}

export function normalizeCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)
}

const cleanName = (name: unknown) => (typeof name === 'string' ? name.trim().slice(0, 14) : '') || 'Player'
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const isPoint = (p: unknown): p is { x: number; y: number } =>
  !!p && typeof p === 'object' && isNum((p as { x: unknown }).x) && isNum((p as { y: unknown }).y)

async function loadPeer() {
  const mod = await import('peerjs')
  return mod.Peer
}

export class HostSession implements Session {
  readonly isHost = true
  localId = 'host'
  paused = false
  private g: GameState
  private inputs = new Map<string, InputState>()
  private conns = new Map<string, DataConnection>()
  private peer: PeerType | null = null
  private sendAcc = 0
  private code: string | null = null
  private status: LobbyInfo['status']
  private started = false
  private destroyed = false

  constructor(
    readonly mode: 'solo' | 'host',
    name: string,
    private onLobby: (info: LobbyInfo) => void,
  ) {
    this.g = createGame(5)
    addHuman(this.g, this.localId, cleanName(name), 'home')
    this.inputs.set(this.localId, emptyInput())
    this.status = mode === 'solo' ? 'lobby' : 'connecting'
    if (mode === 'host') void this.listen(0)
    else this.emitLobby()
  }

  private async listen(attempt: number) {
    const Peer = await loadPeer()
    if (this.destroyed) return
    const code = makeCode()
    const peer = new Peer(PREFIX + code, { debug: 0 })
    this.peer = peer
    peer.on('open', () => {
      this.code = code
      this.status = this.started ? 'playing' : 'lobby'
      this.emitLobby()
    })
    peer.on('connection', (conn) => this.accept(conn))
    peer.on('disconnected', () => {
      if (!this.destroyed) peer.reconnect()
    })
    peer.on('error', (err) => {
      if (err.type === 'unavailable-id' && attempt < 4) {
        peer.destroy()
        void this.listen(attempt + 1)
        return
      }
      if (err.type === 'peer-unavailable') return
      if (this.code && (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error')) return
      this.status = 'error'
      this.emitLobby(`Couldn't open a room (${err.type}). Check your connection and try again.`)
    })
  }

  private accept(conn: DataConnection) {
    const id = conn.peer
    conn.on('data', (raw) => this.handle(id, conn, raw as ClientMsg))
    conn.on('close', () => this.drop(id))
    conn.on('error', () => this.drop(id))
  }

  private drop(id: string) {
    if (!this.conns.has(id)) return
    this.conns.delete(id)
    this.inputs.delete(id)
    removeHuman(this.g, id)
    this.emitLobby()
  }

  private handle(id: string, conn: DataConnection, msg: ClientMsg) {
    if (!msg || typeof msg !== 'object') return
    if (msg.t === 'hello') {
      if (this.conns.size >= 9 && !this.conns.has(id)) {
        conn.close()
        return
      }
      const homeCount = this.g.humans.filter((h) => h.team === 'home').length
      const awayCount = this.g.humans.length - homeCount
      const team: Team = awayCount <= homeCount ? 'away' : 'home'
      if (!addHuman(this.g, id, cleanName(msg.name), team)) {
        conn.close()
        return
      }
      this.conns.set(id, conn)
      this.inputs.set(id, emptyInput())
      conn.send({ t: 'welcome', id } satisfies HostMsg)
      this.emitLobby()
      return
    }
    const input = this.inputs.get(id)
    if (!input) return
    if (msg.t === 'i') {
      input.move = isPoint(msg.move) ? { x: Math.max(-1, Math.min(1, msg.move.x)), y: Math.max(-1, Math.min(1, msg.move.y)) } : { x: 0, y: 0 }
      input.steerTo = isPoint(msg.steerTo) ? { x: msg.steerTo.x, y: msg.steerTo.y } : null
    } else if (msg.t === 'a') {
      if (msg.k === 'throw' && isNum(msg.x) && isNum(msg.y)) input.throwAt = { x: msg.x, y: msg.y }
      else if (msg.k === 'dive') input.dive = true
      else if (msg.k === 'switch') input.switchPlayer = true
      else if (msg.k === 'skip') input.skip = true
    } else if (msg.t === 'team' && !this.started) {
      this.moveToTeam(id, msg.team)
    }
  }

  private moveToTeam(id: string, team: Team) {
    if (team !== 'home' && team !== 'away') return
    const h = this.g.humans.find((x) => x.id === id)
    if (!h || h.team === team || !teamHasRoom(this.g, team)) return
    addHuman(this.g, id, h.name, team)
    this.emitLobby()
  }

  private lobbyInfo(error?: string): LobbyInfo {
    return {
      status: this.status,
      code: this.code,
      players: this.g.humans.map((h) => ({ id: h.id, name: h.name, team: h.team })),
      target: this.g.target,
      error,
    }
  }

  private emitLobby(error?: string) {
    const info = this.lobbyInfo(error)
    this.onLobby(info)
    const msg: HostMsg = { t: 'lobby', info, started: this.started }
    for (const c of this.conns.values()) if (c.open) c.send(msg)
  }

  setTeam(team: Team) {
    if (!this.started) this.moveToTeam(this.localId, team)
  }

  setTarget(target: number) {
    if (this.started) return
    this.g.target = Math.max(1, Math.min(15, Math.round(target)))
    this.emitLobby()
  }

  start() {
    this.started = true
    this.paused = false
    this.status = 'playing'
    startGame(this.g)
    this.emitLobby()
  }

  backToLobby() {
    this.started = false
    this.status = 'lobby'
    this.g.phase = 'menu'
    this.emitLobby()
  }

  update(dt: number, local: InputState) {
    if (!this.started) return
    this.inputs.set(this.localId, local)
    if (!this.paused) update(this.g, this.inputs, dt)
    for (const input of this.inputs.values()) {
      input.throwAt = null
      input.dive = false
      input.switchPlayer = false
      input.skip = false
    }
    if (this.conns.size === 0) return
    this.sendAcc += dt
    if (this.sendAcc < SEND_INTERVAL) return
    this.sendAcc = 0
    const msg: HostMsg = { t: 'f', f: currentFrame(this.g), m: currentMeta(this.g) }
    for (const c of this.conns.values()) if (c.open) c.send(msg)
  }

  current() {
    return { frame: currentFrame(this.g), meta: currentMeta(this.g) }
  }

  destroy() {
    this.destroyed = true
    for (const c of this.conns.values()) c.close()
    this.peer?.destroy()
  }
}

const INTERP_DELAY = 90

export class ClientSession implements Session {
  readonly mode = 'client' as const
  readonly isHost = false
  localId = ''
  paused = false
  private peer: PeerType | null = null
  private conn: DataConnection | null = null
  private buffer: { at: number; frame: Frame; meta: Meta }[] = []
  private sendAcc = 0
  private info: LobbyInfo
  private destroyed = false

  constructor(
    readonly code: string,
    private name: string,
    private onLobby: (info: LobbyInfo) => void,
  ) {
    this.info = { status: 'connecting', code, players: [], target: 5 }
    void this.connect()
  }

  private async connect() {
    const Peer = await loadPeer()
    if (this.destroyed) return
    const peer = new Peer({ debug: 0 })
    this.peer = peer
    const timeout = setTimeout(() => {
      if (this.info.status === 'connecting') this.fail(`Couldn't reach room ${this.code}. Make sure the host is still in the lobby.`)
    }, 15000)
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json' })
      this.conn = conn
      conn.on('open', () => conn.send({ t: 'hello', name: cleanName(this.name) } satisfies ClientMsg))
      conn.on('data', (raw) => {
        clearTimeout(timeout)
        this.handle(raw as HostMsg)
      })
      conn.on('close', () => {
        if (!this.destroyed) this.fail('The host ended the game.', 'closed')
      })
    })
    peer.on('error', (err) => {
      clearTimeout(timeout)
      if (err.type === 'peer-unavailable') this.fail(`No game found with code ${this.code}.`)
      else if (this.info.status === 'connecting') this.fail(`Connection failed (${err.type}).`)
    })
  }

  private fail(error: string, status: LobbyInfo['status'] = 'error') {
    this.info = { ...this.info, status, error }
    this.onLobby(this.info)
  }

  private handle(msg: HostMsg) {
    if (!msg || typeof msg !== 'object') return
    if (msg.t === 'welcome') this.localId = msg.id
    else if (msg.t === 'lobby') {
      this.info = { ...msg.info, status: msg.started ? 'playing' : 'lobby' }
      if (!msg.started) this.buffer = []
      this.onLobby(this.info)
    } else if (msg.t === 'f') {
      this.buffer.push({ at: performance.now(), frame: msg.f, meta: msg.m })
      if (this.buffer.length > 12) this.buffer.shift()
    }
  }

  private send(msg: ClientMsg) {
    if (this.conn?.open) this.conn.send(msg)
  }

  update(dt: number, input: InputState) {
    if (input.throwAt) this.send({ t: 'a', k: 'throw', x: input.throwAt.x, y: input.throwAt.y })
    if (input.dive) this.send({ t: 'a', k: 'dive' })
    if (input.switchPlayer) this.send({ t: 'a', k: 'switch' })
    if (input.skip) this.send({ t: 'a', k: 'skip' })
    this.sendAcc += dt
    if (this.sendAcc >= SEND_INTERVAL) {
      this.sendAcc = 0
      this.send({ t: 'i', move: input.move, steerTo: input.steerTo })
    }
  }

  current(now: number) {
    const buf = this.buffer
    if (!buf.length) return null
    const rt = now - INTERP_DELAY
    for (let i = buf.length - 1; i > 0; i--) {
      const a = buf[i - 1]
      const b = buf[i]
      if (a.at <= rt && rt <= b.at) {
        const t = (rt - a.at) / Math.max(1, b.at - a.at)
        return { frame: lerpFrame(a.frame, b.frame, t), meta: b.meta }
      }
    }
    const last = buf[buf.length - 1]
    return { frame: last.frame, meta: last.meta }
  }

  setTeam(team: Team) {
    this.send({ t: 'team', team })
  }

  setTarget() {}
  start() {}
  backToLobby() {}

  destroy() {
    this.destroyed = true
    this.conn?.close()
    this.peer?.destroy()
  }
}
