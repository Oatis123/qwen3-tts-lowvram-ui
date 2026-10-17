import { useEffect, useRef, useState } from 'react'
import { peaks, SR } from '../lib/audio'

const BAR = 3
const GAP = 2

function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [w, setW] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [ref])
  return w
}

export function drawWave(
  canvas: HTMLCanvasElement,
  samples: Float32Array,
  width: number,
  height: number,
  opts: { progress?: number; totalSamples?: number; region?: [number, number] | null; color?: string; played?: string }
): void {
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.floor(width * dpr)
  canvas.height = Math.floor(height * dpr)
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, width, height)
  const bars = Math.max(1, Math.floor(width / (BAR + GAP)))
  const total = Math.max(opts.totalSamples ?? samples.length, samples.length, 1)
  const filled = Math.round((samples.length / total) * bars)
  const p = peaks(samples, Math.max(1, filled))
  let max = 0.05
  for (const v of p) max = Math.max(max, v)
  const style = getComputedStyle(document.documentElement)
  const base = opts.color ?? style.getPropertyValue('--color-line-2')
  const played = opts.played ?? style.getPropertyValue('--color-accent')
  const progressX = (opts.progress ?? 0) * width
  for (let i = 0; i < bars; i++) {
    const x = i * (BAR + GAP)
    const v = i < filled ? p[i] / max : 0
    const h = Math.max(2, v * (height - 4))
    let color = base
    if (opts.region) {
      const t = (x / width) * (total / SR)
      color = t >= opts.region[0] && t <= opts.region[1] ? played : base
    } else if (x < progressX) color = played
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.roundRect(x, (height - h) / 2, BAR, h, 1.5)
    ctx.fill()
  }
}

export function Waveform({
  samples,
  progress,
  totalSamples,
  height = 72,
  onSeek,
  version
}: {
  samples: Float32Array
  progress: number
  totalSamples?: number
  height?: number
  onSeek?: (fraction: number) => void
  version?: number
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const width = useWidth(wrap)
  useEffect(() => {
    if (canvas.current && width) drawWave(canvas.current, samples, width, height, { progress, totalSamples })
  }, [samples, progress, width, height, totalSamples, version])
  return (
    <div
      ref={wrap}
      className={onSeek ? 'cursor-pointer' : undefined}
      style={{ height }}
      onMouseDown={(e) => {
        if (!onSeek) return
        const r = e.currentTarget.getBoundingClientRect()
        onSeek((e.clientX - r.left) / r.width)
      }}
    >
      <canvas ref={canvas} style={{ width: '100%', height }} />
    </div>
  )
}

export function RegionWave({
  samples,
  region,
  onChange,
  playhead,
  height = 96
}: {
  samples: Float32Array
  region: [number, number]
  onChange: (r: [number, number]) => void
  playhead?: number | null
  height?: number
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const width = useWidth(wrap)
  const total = samples.length / SR
  const drag = useRef<null | { kind: 'a' | 'b' | 'move'; start: number; region: [number, number] }>(null)

  useEffect(() => {
    if (canvas.current && width) drawWave(canvas.current, samples, width, height, { region })
  }, [samples, width, height, region])

  const toSec = (clientX: number): number => {
    const r = wrap.current!.getBoundingClientRect()
    return Math.max(0, Math.min(total, ((clientX - r.left) / r.width) * total))
  }

  useEffect(() => {
    const move = (e: MouseEvent): void => {
      const d = drag.current
      if (!d) return
      const t = toSec(e.clientX)
      const min = 1
      if (d.kind === 'a') onChange([Math.min(t, region[1] - min), region[1]])
      else if (d.kind === 'b') onChange([region[0], Math.max(t, region[0] + min)])
      else {
        const len = d.region[1] - d.region[0]
        let a = d.region[0] + (t - d.start)
        a = Math.max(0, Math.min(total - len, a))
        onChange([a, a + len])
      }
    }
    const up = (): void => {
      drag.current = null
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  })

  const left = (region[0] / total) * 100
  const right = (region[1] / total) * 100
  return (
    <div ref={wrap} className="relative select-none" style={{ height }}>
      <canvas ref={canvas} style={{ width: '100%', height }} />
      <div
        className="absolute top-0 bottom-0 border-y-2 border-accent/60 bg-accent/10 cursor-grab active:cursor-grabbing"
        style={{ left: `${left}%`, width: `${right - left}%` }}
        onMouseDown={(e) => (drag.current = { kind: 'move', start: toSec(e.clientX), region })}
      />
      {(['a', 'b'] as const).map((k) => (
        <div
          key={k}
          className="absolute top-0 bottom-0 w-3 -ml-1.5 cursor-ew-resize flex items-center justify-center"
          style={{ left: `${k === 'a' ? left : right}%` }}
          onMouseDown={(e) => {
            e.stopPropagation()
            drag.current = { kind: k, start: toSec(e.clientX), region }
          }}
        >
          <div className="h-full w-1 rounded-full bg-accent" />
          <div className="absolute h-7 w-3 rounded-md bg-accent" />
        </div>
      ))}
      {playhead != null && (
        <div className="absolute top-0 bottom-0 w-0.5 bg-white/80 pointer-events-none" style={{ left: `${(playhead / total) * 100}%` }} />
      )}
    </div>
  )
}
