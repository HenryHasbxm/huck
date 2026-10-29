'use client'

import { useState } from 'react'
import { Check, Link2 } from 'lucide-react'
import { PER_TEAM, TEAM_NAME, type Team } from '@/lib/game/engine'
import type { LobbyInfo, Session } from '@/lib/game/session'
import { cn } from '@/lib/utils'

interface Props {
  session: Session
  lobby: LobbyInfo
  onLeave: () => void
}

const TARGETS = [3, 5, 7]

export function LobbyScreen({ session, lobby, onLeave }: Props) {
  const [copied, setCopied] = useState(false)
  const me = lobby.players.find((p) => p.id === session.localId)
  const host = lobby.players.find((p) => p.id === 'host')

  const copyInvite = async () => {
    if (!lobby.code) return
    const url = `${window.location.origin}${window.location.pathname}?room=${lobby.code}`
    try {
      if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: 'Join my HUCK game', url })
      } else {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      }
    } catch {
      // user dismissed the share sheet
    }
  }

  return (
    <section className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Room code</p>
          <p className="font-mono text-6xl font-semibold tracking-[0.25em] text-foreground md:text-7xl">{lobby.code}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={copyInvite}
            className="flex items-center gap-2 rounded-full border border-border px-5 py-2.5 font-bold text-foreground hover:bg-foreground/10"
          >
            {copied ? <Check className="size-4" aria-hidden /> : <Link2 className="size-4" aria-hidden />}
            {copied ? 'Link copied' : 'Invite link'}
          </button>
          <button
            type="button"
            onClick={onLeave}
            className="rounded-full px-5 py-2.5 font-bold text-muted-foreground hover:text-foreground"
          >
            Leave
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {(['home', 'away'] as Team[]).map((team) => {
          const roster = lobby.players.filter((p) => p.team === team)
          const full = roster.length >= PER_TEAM
          const mine = me?.team === team
          return (
            <div
              key={team}
              className={cn(
                'flex flex-col gap-3 rounded-xl border p-4',
                team === 'home' ? 'border-home/40 bg-home/5' : 'border-away/40 bg-away/5',
              )}
            >
              <div className="flex items-center justify-between">
                <h2 className={cn('font-sans text-2xl font-extrabold', team === 'home' ? 'text-home' : 'text-away')}>
                  {TEAM_NAME[team]}
                </h2>
                <button
                  type="button"
                  disabled={mine || full}
                  onClick={() => session.setTeam(team)}
                  className="rounded-full border border-border px-4 py-1.5 text-sm font-bold text-foreground hover:bg-foreground/10 disabled:opacity-40"
                >
                  {mine ? "You're here" : full ? 'Full' : 'Join'}
                </button>
              </div>
              <ul className="flex flex-col gap-1.5">
                {Array.from({ length: PER_TEAM }, (_, i) => {
                  const p = roster[i]
                  return (
                    <li
                      key={p?.id ?? `ai-${i}`}
                      className="flex items-center justify-between rounded-md bg-background/60 px-3 py-2 font-mono text-sm"
                    >
                      <span className={p ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
                        {p ? p.name : 'AI'}
                      </span>
                      <span className="text-xs uppercase tracking-widest text-muted-foreground">
                        {p?.id === session.localId ? 'you' : p?.id === 'host' ? 'host' : ''}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-border p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Game to</span>
          <div className="flex gap-1" role="radiogroup" aria-label="Points to win">
            {TARGETS.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={lobby.target === t}
                disabled={!session.isHost}
                onClick={() => session.setTarget(t)}
                className={cn(
                  'size-10 rounded-md border font-mono font-semibold',
                  lobby.target === t ? 'border-foreground bg-foreground text-background' : 'border-border text-foreground',
                  !session.isHost && lobby.target !== t && 'opacity-40',
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        {session.isHost ? (
          <button
            type="button"
            onClick={() => session.start()}
            className="rounded-full bg-home px-8 py-3 text-lg font-extrabold text-background transition-transform hover:scale-105"
          >
            {`Start game · ${lobby.players.length} ${lobby.players.length === 1 ? 'player' : 'players'}`}
          </button>
        ) : (
          <p className="font-mono text-sm text-muted-foreground">{`Waiting for ${host?.name ?? 'the host'} to start…`}</p>
        )}
      </div>
    </section>
  )
}
