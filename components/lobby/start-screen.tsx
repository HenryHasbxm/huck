'use client'

import { useState } from 'react'
import type { Mode } from '@/lib/game/session'
import { normalizeCode } from '@/lib/game/session'
import { cn } from '@/lib/utils'

interface Props {
  initialRoom: string | null
  onBegin: (mode: Mode, name: string, code?: string) => void
}

export function StartScreen({ initialRoom, onBegin }: Props) {
  const [name, setName] = useState('')
  const [code, setCode] = useState(initialRoom ? normalizeCode(initialRoom) : '')
  const invited = !!initialRoom
  const canJoin = code.length === 5

  return (
    <section className="grid flex-1 gap-8 md:grid-cols-[1.2fr_1fr] md:items-center">
      <div className="flex flex-col gap-4">
        <p className="font-mono text-xs uppercase tracking-widest text-home">
          {invited ? `You're invited · room ${normalizeCode(initialRoom)}` : 'Pickup is on'}
        </p>
        <h2 className="text-balance font-sans text-5xl font-extrabold leading-none tracking-tight md:text-7xl">
          {invited ? 'Your crew is on the line.' : 'Grab some friends. Huck it deep.'}
        </h2>
        <p className="max-w-lg text-pretty leading-relaxed text-muted-foreground">
          {
            'Host a room and share the code — everyone plays on their own phone or laptop, picks a side, and controls their own cutter. Empty spots are filled by AI. Every score gets a slow-mo replay.'
          }
        </p>
      </div>

      <div className="flex flex-col gap-5 rounded-xl border border-border bg-foreground/5 p-5 md:p-6">
        <label className="flex flex-col gap-2">
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 14))}
            placeholder="Player"
            autoComplete="nickname"
            className="rounded-lg border border-border bg-background px-4 py-3 text-lg font-semibold text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-home"
          />
        </label>

        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (canJoin) onBegin('client', name, code)
          }}
        >
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Join a room</span>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(normalizeCode(e.target.value))}
              placeholder="CODE"
              aria-label="Room code"
              autoCapitalize="characters"
              spellCheck={false}
              className="w-full min-w-0 rounded-lg border border-border bg-background px-4 py-3 font-mono text-lg font-semibold uppercase tracking-[0.3em] text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-home"
            />
            <button
              type="submit"
              disabled={!canJoin}
              className={cn(
                'shrink-0 rounded-lg px-6 font-bold transition-opacity disabled:opacity-40',
                invited ? 'bg-home text-background' : 'bg-foreground text-background',
              )}
            >
              Join
            </button>
          </div>
        </form>

        <div className="flex items-center gap-3 text-muted-foreground" aria-hidden>
          <span className="h-px flex-1 bg-border" />
          <span className="font-mono text-xs uppercase tracking-widest">or</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onBegin('host', name)}
            className={cn(
              'rounded-lg px-4 py-3 font-bold transition-transform hover:scale-[1.02]',
              invited ? 'border border-border text-foreground' : 'bg-home text-background',
            )}
          >
            Host a game
          </button>
          <button
            type="button"
            onClick={() => onBegin('solo', name)}
            className="rounded-lg border border-border px-4 py-3 font-bold text-foreground hover:bg-foreground/10"
          >
            Play solo
          </button>
        </div>
      </div>
    </section>
  )
}
