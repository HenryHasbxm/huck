import type { HudSnapshot } from './frisbee-game'

function Key({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-border bg-foreground/5 px-1.5 py-0.5 font-mono text-xs text-foreground">{children}</kbd>
}

export function ControlsBar({ hud, onDive, onSwitch }: { hud: HudSnapshot | null; onDive: () => void; onSwitch: () => void }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <p className="font-mono text-sm leading-relaxed text-muted-foreground">
        {hud?.localHolding ? (
          <>
            <span className="text-home">{'Your disc: '}</span>
            {'aim with the pointer, release to throw. Lead your cutters.'}
          </>
        ) : (
          <>
            <span className="text-foreground">{'You’re the dashed ring: '}</span>
            {'move with '}
            <Key>WASD</Key> {'or drag. '}
            <Key>Space</Key> {' to lay out, '}
            <Key>Q</Key> {' to switch.'}
          </>
        )}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault()
            onDive()
          }}
          className="flex-1 touch-none rounded-full bg-foreground px-6 py-2.5 font-sans font-bold text-background md:flex-none"
        >
          Lay out
        </button>
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault()
            onSwitch()
          }}
          className="flex-1 touch-none rounded-full border border-border px-6 py-2.5 font-sans font-bold text-foreground md:flex-none"
        >
          Switch
        </button>
      </div>
    </div>
  )
}
