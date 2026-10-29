import { Pause } from 'lucide-react'
import type { HudSnapshot } from './frisbee-game'
import { TEAM_NAME, type Team } from '@/lib/game/engine'
import { cn } from '@/lib/utils'

export function Scoreboard({ hud, onPause }: { hud: HudSnapshot | null; onPause: () => void }) {
  const stall = hud?.stall ?? 0
  const live = hud?.phase === 'play'
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 font-mono" aria-live="polite">
        <TeamScore team="home" value={hud?.home ?? 0} active={hud?.possession === 'home' && live} mine={hud?.localTeam === 'home'} />
        <span className="text-muted-foreground">{'–'}</span>
        <TeamScore team="away" value={hud?.away ?? 0} active={hud?.possession === 'away' && live} mine={hud?.localTeam === 'away'} />
        <span className="hidden text-xs uppercase tracking-widest text-muted-foreground sm:inline">
          {'to '}
          {hud?.target ?? 5}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 font-mono text-sm" aria-label={`Stall count ${stall}`}>
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Stall</span>
          <span
            className={cn(
              'flex size-8 items-center justify-center rounded-md border border-border tabular-nums',
              stall >= 8 && 'border-home bg-home text-background',
            )}
          >
            {stall || '·'}
          </span>
        </div>
        {hud?.mode === 'solo' && (
          <button
            type="button"
            onClick={onPause}
            disabled={!live}
            className="flex size-8 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-foreground/10 disabled:opacity-40"
            aria-label="Pause game"
          >
            <Pause className="size-4" />
          </button>
        )}
      </div>
    </div>
  )
}

function TeamScore({ team, value, active, mine }: { team: Team; value: number; active: boolean; mine: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'size-3 rounded-full',
          team === 'home' ? 'bg-home' : 'bg-away',
          active && 'ring-2 ring-foreground/70 ring-offset-2 ring-offset-background',
        )}
        aria-hidden
      />
      <span className={cn('text-xs uppercase tracking-widest', mine ? 'text-foreground' : 'text-muted-foreground')}>
        {TEAM_NAME[team]}
        {mine && <span className="sr-only">{' (your team)'}</span>}
      </span>
      <span className="text-2xl font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  )
}
