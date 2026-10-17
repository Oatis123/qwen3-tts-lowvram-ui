import { Pause, Play } from 'lucide-react'
import { useEffect, useReducer, type ReactNode } from 'react'
import { formatTime, SR } from '../lib/audio'
import type { WavePlayer } from '../lib/player'
import { Waveform } from './Waveform'

export function PlayerView({ player, expectedSeconds, actions }: { player: WavePlayer; expectedSeconds?: number; actions?: ReactNode }) {
  const [, force] = useReducer((x: number) => x + 1, 0)

  useEffect(() => player.subscribe(force), [player])
  useEffect(() => {
    let raf = 0
    const loop = (): void => {
      player.tick()
      if (player.playing || player.streaming) force()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [player])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement).tagName
      if (e.code === 'Space' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && player.length) {
        e.preventDefault()
        player.toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [player])

  const duration = player.duration
  const pos = player.position()
  const total = player.streaming ? Math.max(player.length, (expectedSeconds ?? 0) * SR) : player.length
  const progress = player.length ? (pos * SR) / Math.max(1, total) : 0

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={() => player.toggle()}
        disabled={!player.length}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-white hover:bg-accent-2 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition-colors"
        aria-label={player.playing ? 'Пауза' : 'Воспроизвести'}
      >
        {player.playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <Waveform
          samples={player.samples}
          totalSamples={total}
          progress={progress}
          version={player.version}
          height={56}
          onSeek={player.streaming ? undefined : (f) => player.seek(f * duration)}
        />
        <div className="mt-1 flex justify-between font-mono text-xs text-faint">
          <span>{formatTime(pos)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  )
}
