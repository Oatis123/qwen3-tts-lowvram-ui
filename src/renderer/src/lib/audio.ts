export const SR = 24000

export async function decodeToMono(data: ArrayBuffer, targetSr = SR): Promise<Float32Array> {
  const ctx = new AudioContext()
  let decoded: AudioBuffer
  try {
    decoded = await ctx.decodeAudioData(data)
  } finally {
    void ctx.close()
  }
  const length = Math.max(1, Math.ceil((decoded.duration * targetSr)))
  const offline = new OfflineAudioContext(1, length, targetSr)
  const src = offline.createBufferSource()
  src.buffer = decoded
  src.connect(offline.destination)
  src.start()
  const rendered = await offline.startRendering()
  return rendered.getChannelData(0).slice()
}

export function encodeWav(samples: Float32Array, sr = SR): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const str = (o: number, s: string): void => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i))
  }
  str(0, 'RIFF')
  v.setUint32(4, 36 + samples.length * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, sr, true)
  v.setUint32(28, sr * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([buf], { type: 'audio/wav' })
}

export function peaks(samples: Float32Array, buckets: number, upTo = samples.length): Float32Array {
  const out = new Float32Array(buckets)
  if (!upTo) return out
  const step = upTo / buckets
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * step)
    const end = Math.min(upTo, Math.floor((b + 1) * step))
    let m = 0
    for (let i = start; i < end; i++) {
      const a = Math.abs(samples[i])
      if (a > m) m = a
    }
    out[b] = m
  }
  return out
}

function frameDb(samples: Float32Array, sr: number, frameSec = 0.02): Float32Array {
  const win = Math.max(1, Math.floor(sr * frameSec))
  const n = Math.floor(samples.length / win)
  const out = new Float32Array(n)
  let peak = 1e-9
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]))
  for (let f = 0; f < n; f++) {
    let sum = 0
    for (let i = f * win; i < (f + 1) * win; i++) sum += samples[i] * samples[i]
    out[f] = 20 * Math.log10(Math.sqrt(sum / win + 1e-12) / peak)
  }
  return out
}

export function suggestRegion(samples: Float32Array, sr = SR, maxSec = 15, minSec = 6): [number, number] {
  const total = samples.length / sr
  const db = frameDb(samples, sr)
  const frame = 0.02
  const loud = (f: number): boolean => db[f] > -40
  let first = 0
  while (first < db.length && !loud(first)) first++
  let last = db.length - 1
  while (last > first && !loud(last)) last--
  if (first >= db.length) return [0, Math.min(total, maxSec)]
  const start = Math.max(0, first * frame - 0.15)
  const end = Math.min(total, (last + 1) * frame + 0.15)
  if (end - start <= 20) return [start, end]
  const gaps: number[] = []
  let run = 0
  for (let f = first; f <= last; f++) {
    if (!loud(f)) run++
    else {
      if (run * frame >= 0.25) gaps.push((f - run / 2) * frame)
      run = 0
    }
  }
  const candidates = gaps.filter((g) => g - start >= minSec && g - start <= maxSec)
  const cut = candidates.length ? candidates[candidates.length - 1] : start + maxSec
  return [start, Math.min(end, cut)]
}

export const sliceSec = (samples: Float32Array, a: number, b: number, sr = SR): Float32Array =>
  samples.slice(Math.floor(a * sr), Math.floor(b * sr))

export function formatTime(sec: number): string {
  if (!Number.isFinite(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export async function fetchSamples(url: string): Promise<Float32Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return decodeToMono(await res.arrayBuffer())
}
