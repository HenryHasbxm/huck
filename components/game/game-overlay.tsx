import type { HudSnapshot } from './frisbee-game'
import { TEAM_NAME } from '@/lib/game/engine'
import { cn } from '@/lib/utils'

interface Props {
  hud: HudSnapshot | null
  onRematch: () => void
  onLobby: () => void
  onLeave: () => void
  onResume: () => void
  onSkip: () => void
}

const primaryBtn =
  'rounded-full bg-home px-7 py-3 font-sans text-base font-bold text-background transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground'
const secondaryBtn =
  'rounded-full border border-foreground/40 px-7 py-3 font-sans text-base font-bold text-foreground transition-colors hover:bg-foreground/10'

export function GameOverlay({ hud, onRematch, onLobby, onLeave, onResume, onSkip }: Props) {
  if (!hud) return null

  if (hud.phase === 'over') {
    const won = hud.localTeam && hud.winner === hud.localTeam
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <h2 className="font-sans text-4xl font-extrabold tracking-tight text-balance md:text-5xl">
            {won ? 'Game. You took it.' : `${hud.winner ? TEAM_NAME[hud.winner] : ''} takes the game.`}
          </h2>
          <p className="font-mono text-lg tabular-nums text-muted-foreground">
            {TEAM_NAME.home} {hud.home} {'–'} {hud.away} {TEAM_NAME.away}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {hud.mode === 'client' ? (
              <p className="font-mono text-sm text-muted-foreground">{'Waiting for the host to start a rematch…'}</p>
            ) : (
              <>
                <button type="button" onClick={onRematch} className={primaryBtn}>
                  Rematch
                </button>
                <button type="button" onClick={hud.mode === 'host' ? onLobby : onLeave} className={secondaryBtn}>
                  {hud.mode === 'host' ? 'Back to lobby' : 'Main menu'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (hud.paused) {
    return (
      <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/70 backdrop-blur-sm">
        <button type="button" onClick={onResume} className={primaryBtn}>
          Resume
        </button>
        <button type="button" onClick={onLeave} className={secondaryBtn}>
          Main menu
        </button>
      </div>
    )
  }

  if (hud.phase === 'replay' && hud.replay) {
    const r = hud.replay
    return (
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 md:p-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 rounded-md bg-background/80 px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-widest text-foreground">
            <span className="size-2 animate-pulse rounded-full bg-home" aria-hidden />
            {'Replay'}
          </span>
          <button
            type="button"
            onClick={onSkip}
            className="pointer-events-auto rounded-full bg-background/80 px-4 py-1.5 font-sans text-sm font-bold text-foreground hover:bg-background"
          >
            Skip
          </button>
        </div>
        <div className="flex flex-col gap-2 rounded-lg bg-background/80 px-4 py-3" role="status">
          <p className="text-pretty font-sans text-base font-bold md:text-lg">
            <span className={r.team === 'home' ? 'text-home' : 'text-away'}>
              {TEAM_NAME[r.team]}
              {' · '}
            </span>
            {r.caption}
          </p>
          <div className="h-1 w-full overflow-hidden rounded-full bg-foreground/15">
            <div
              className={cn('h-full rounded-full', r.team === 'home' ? 'bg-home' : 'bg-away')}
              style={{ width: `${r.progress * 100}%` }}
            />
          </div>
        </div>
      </div>
    )
  }

  if (!hud.message) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-4" role="status">
      <span
        className={cn(
          'animate-in fade-in zoom-in-95 rounded-full px-4 py-1.5 font-sans text-sm font-bold text-background shadow-lg md:text-base',
          hud.messageTeam === 'home' && 'bg-home',
          hud.messageTeam === 'away' && 'bg-away',
          !hud.messageTeam && 'bg-foreground',
        )}
      >
        {hud.message}
      </span>
    </div>
  )
}
