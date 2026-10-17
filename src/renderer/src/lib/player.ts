import { SR } from './audio'

let sharedCtx: AudioContext | null = null
const audioCtx = (): AudioContext => {
  if (!sharedCtx || sharedCtx.state === 'closed') sharedCtx = new AudioContext({ sampleRate: SR, latencyHint: 'interactive' })
  return sharedCtx
}

type Listener = () => void

export class WavePlayer {
  private data = new Float32Array(SR * 10)
  length = 0
  streaming = false
  playing = false
  private startedAt = 0
  private offset = 0
  private gain: GainNode | null = null
  private sources: AudioBufferSourceNode[] = []
  private listeners = new Set<Listener>()
  version = 0

  get samples(): Float32Array {
    return this.data.subarray(0, this.length)
  }

  get duration(): number {
    return this.length / SR
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private changed(): void {
    this.version++
    for (const fn of this.listeners) fn()
  }

  private append(chunk: Float32Array): number {
    const pos = this.length
    if (pos + chunk.length > this.data.length) {
      const next = new Float32Array(Math.max(this.data.length * 2, pos + chunk.length))
      next.set(this.data.subarray(0, pos))
      this.data = next
    }
    this.data.set(chunk, pos)
    this.length += chunk.length
    return pos
  }

  private silence(): void {
    const ctx = audioCtx()
    if (this.gain) {
      const g = this.gain
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.015)
      const old = this.sources
      setTimeout(() => {
        for (const s of old) {
          try {
            s.stop()
          } catch {
            /* already stopped */
          }
        }
        g.disconnect()
      }, 120)
    }
    this.gain = null
    this.sources = []
  }

  private ensureGain(): GainNode {
    if (!this.gain) {
      const ctx = audioCtx()
      this.gain = ctx.createGain()
      this.gain.connect(ctx.destination)
    }
    return this.gain
  }

  private schedule(samples: Float32Array, pos: number): void {
    const ctx = audioCtx()
    const min = ctx.currentTime + 0.03
    let at = this.startedAt + pos / SR
    if (at < min) {
      this.startedAt += min - at
      at = min
    }
    const buf = ctx.createBuffer(1, samples.length, SR)
    buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(this.ensureGain())
    src.start(at)
    this.sources.push(src)
    src.onended = () => {
      this.sources = this.sources.filter((s) => s !== src)
    }
  }

  load(samples: Float32Array): void {
    this.silence()
    this.data = new Float32Array(samples)
    this.length = samples.length
    this.streaming = false
    this.playing = false
    this.offset = 0
    this.changed()
  }

  clear(): void {
    this.load(new Float32Array(0))
  }

  beginStream(autoplay = true): void {
    this.silence()
    this.data = new Float32Array(SR * 10)
    this.length = 0
    this.streaming = true
    this.offset = 0
    this.playing = autoplay
    if (autoplay) {
      const ctx = audioCtx()
      void ctx.resume()
      this.startedAt = ctx.currentTime + 0.08
    }
    this.changed()
  }

  push(chunk: Float32Array): void {
    const pos = this.append(chunk)
    if (this.playing) this.schedule(chunk, pos)
    this.changed()
  }

  endStream(): void {
    this.streaming = false
    this.changed()
  }

  position(): number {
    if (!this.playing) return this.offset
    const p = audioCtx().currentTime - this.startedAt
    return Math.max(0, Math.min(this.duration, p))
  }

  tick(): void {
    if (this.playing && !this.streaming && this.position() >= this.duration - 0.005) {
      this.playing = false
      this.offset = 0
      this.silence()
      this.changed()
    }
  }

  play(from = this.offset): void {
    if (!this.length) return
    this.silence()
    const ctx = audioCtx()
    void ctx.resume()
    if (from >= this.duration - 0.01) from = 0
    const pos = Math.floor(from * SR)
    this.startedAt = ctx.currentTime + 0.03 - from
    this.playing = true
    this.schedule(this.samples.slice(pos), pos)
    this.changed()
  }

  pause(): void {
    if (!this.playing) return
    this.offset = this.position()
    this.playing = false
    this.silence()
    this.changed()
  }

  toggle(): void {
    if (this.playing) this.pause()
    else this.play()
  }

  seek(sec: number): void {
    const s = Math.max(0, Math.min(this.duration, sec))
    if (this.playing) this.play(s)
    else {
      this.offset = s
      this.changed()
    }
  }

  stop(): void {
    this.playing = false
    this.offset = 0
    this.silence()
    this.changed()
  }
}

export class ClipPlayer {
  private audio: HTMLAudioElement | null = null
  current: string | null = null
  private listeners = new Set<() => void>()

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private onChange(): void {
    for (const fn of this.listeners) fn()
  }

  toggle(key: string, url: string): void {
    if (this.current === key) return this.stop()
    this.stop()
    const a = new Audio(url)
    this.audio = a
    this.current = key
    a.onended = () => this.stop()
    void a.play().catch(() => this.stop())
    this.onChange()
  }

  playSamples(key: string, samples: Float32Array): void {
    this.stop()
    const ctx = audioCtx()
    void ctx.resume()
    const buf = ctx.createBuffer(1, samples.length, SR)
    buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    src.start()
    this.current = key
    const stopFn = (): void => {
      try {
        src.stop()
      } catch {
        /* already stopped */
      }
    }
    this.audio = { pause: stopFn } as unknown as HTMLAudioElement
    src.onended = () => {
      if (this.current === key) this.stop()
    }
    this.onChange()
  }

  stop(): void {
    this.audio?.pause()
    this.audio = null
    this.current = null
    this.onChange()
  }
}

export const clipPlayer = new ClipPlayer()
