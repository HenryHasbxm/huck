import { HuckApp } from '@/components/huck-app'

export default async function Page({ searchParams }: { searchParams: Promise<{ room?: string | string[] }> }) {
  const { room } = await searchParams
  const initialRoom = typeof room === 'string' && room.trim() ? room : null
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-7xl flex-col gap-4 px-4 py-4 md:px-8 md:py-8">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="font-sans text-3xl font-extrabold tracking-tight md:text-4xl">
          HUCK<span className="text-home">.</span>
        </h1>
        <p className="hidden font-mono text-xs uppercase tracking-widest text-muted-foreground sm:block">
          {'Ultimate · 5v5 · play with friends'}
        </p>
      </header>
      <HuckApp initialRoom={initialRoom} />
    </main>
  )
}
