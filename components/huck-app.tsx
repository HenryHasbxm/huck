'use client'

import { useEffect, useRef, useState } from 'react'
import { FrisbeeGame } from '@/components/game/frisbee-game'
import { StartScreen } from '@/components/lobby/start-screen'
import { LobbyScreen } from '@/components/lobby/lobby-screen'
import { ClientSession, HostSession, normalizeCode, type LobbyInfo, type Mode, type Session } from '@/lib/game/session'

export function HuckApp({ initialRoom }: { initialRoom: string | null }) {
  const [session, setSession] = useState<Session | null>(null)
  const [lobby, setLobby] = useState<LobbyInfo | null>(null)
  const sessionRef = useRef<Session | null>(null)

  useEffect(() => () => sessionRef.current?.destroy(), [])

  const begin = (mode: Mode, name: string, code?: string) => {
    sessionRef.current?.destroy()
    const room = code ? normalizeCode(code) : null
    setLobby({ status: mode === 'solo' ? 'playing' : 'connecting', code: room, players: [], target: 5 })
    const s: Session = mode === 'client' && room ? new ClientSession(room, name, setLobby) : new HostSession(mode === 'solo' ? 'solo' : 'host', name, setLobby)
    if (mode === 'solo') s.start()
    sessionRef.current = s
    setSession(s)
  }

  const leave = () => {
    sessionRef.current?.destroy()
    sessionRef.current = null
    setSession(null)
    setLobby(null)
    if (initialRoom) window.history.replaceState(null, '', window.location.pathname)
  }

  if (!session || !lobby) return <StartScreen initialRoom={initialRoom} onBegin={begin} />

  if (lobby.status === 'error' || lobby.status === 'closed' || lobby.status === 'connecting') {
    const connecting = lobby.status === 'connecting'
    return (
      <section className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-border p-8 text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {connecting ? (session.mode === 'client' ? `Joining ${lobby.code}` : 'Opening a room') : 'Connection'}
        </p>
        <h2 className="text-balance font-sans text-3xl font-extrabold tracking-tight">
          {connecting ? 'Warming up…' : lobby.error ?? 'Disconnected.'}
        </h2>
        <button
          type="button"
          onClick={leave}
          className="rounded-full border border-foreground/40 px-6 py-2.5 font-bold text-foreground hover:bg-foreground/10"
        >
          {connecting ? 'Cancel' : 'Back to menu'}
        </button>
      </section>
    )
  }

  if (lobby.status === 'lobby') return <LobbyScreen session={session} lobby={lobby} onLeave={leave} />

  return <FrisbeeGame session={session} onLeave={leave} />
}
