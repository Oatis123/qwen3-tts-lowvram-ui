import type { GenParams, LoadOptions, Mode, Size } from '../../../shared/types'

export interface Voice {
  id: string
  name: string
  text: string
  language: string
  duration: number
  source: string
  created: number
  favorite?: boolean
}

export interface GenStats {
  first_chunk_ms: number
  gen_seconds: number
  audio_seconds: number
  rtf: number | null
  peak_vram: number
}

export interface HistoryItem {
  id: string
  text: string
  mode: Mode
  size: Size
  model_id: string
  voice_id: string | null
  voice_name: string
  speaker: string | null
  instruct: string | null
  language: string
  seed: number
  params: GenParams
  stats: GenStats
  duration: number
  created: number
}

export interface ModelStatus {
  state: 'idle' | 'loading' | 'ready' | 'error'
  model_id: string | null
  error: string | null
  busy: boolean
  load: LoadOptions | null
}

export interface Stats {
  cuda: boolean
  gpu?: string
  vram_used?: number
  vram_total?: number
  torch_allocated?: number
  torch_reserved?: number
  torch_peak?: number
}

export interface GenRequest {
  mode: Mode
  size: Size
  text: string
  language: string
  voice_id?: string | null
  speaker?: string | null
  instruct?: string | null
  params: GenParams
  load: LoadOptions
  save?: boolean
}

export type GenEvent =
  | { type: 'loading'; model_id: string }
  | { type: 'start'; sr: number; segments: number; seed: number; model_id: string }
  | { type: 'segment'; index: number; text: string }
  | { type: 'done'; stats: GenStats; item: HistoryItem | null; seed: number }
  | { type: 'stopped'; stats: GenStats }
  | { type: 'error'; code: string; message: string }

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message)
  }
}

let base = ''
let token = ''

export function configure(port: number, tok: string): void {
  base = `http://127.0.0.1:${port}`
  token = tok
}

export const ready = (): boolean => !!base

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: { 'x-token': token } }
  if (body instanceof FormData) init.body = body
  else if (body !== undefined) {
    init.body = JSON.stringify(body)
    ;(init.headers as Record<string, string>)['content-type'] = 'application/json'
  }
  const res = await fetch(base + path, init)
  const type = res.headers.get('content-type') ?? ''
  const data = type.includes('json') ? await res.json() : await res.arrayBuffer()
  if (!res.ok) {
    const detail = (data as { detail?: unknown; code?: string })?.detail
    throw new ApiError(typeof detail === 'string' ? detail : `HTTP ${res.status}`, res.status, (data as { code?: string })?.code)
  }
  return data as T
}

export const fileUrl = (path: string): string => `${base}${path}${path.includes('?') ? '&' : '?'}token=${token}`

export const api = {
  status: () => request<{ model: ModelStatus; compat: { running: boolean; host: string | null; port: number | null } }>('GET', '/status'),
  stats: () => request<Stats>('GET', '/stats'),
  loadModel: (model_id: string, load: LoadOptions) => request<ModelStatus>('POST', '/model/load', { model_id, load }),
  unloadModel: () => request<ModelStatus>('POST', '/model/unload'),
  transcribe: (wav: Blob, opts: { model: string; language?: string; device: string; compute_type: string; beam_size: number; vad: boolean }) => {
    const f = new FormData()
    f.append('file', wav, 'audio.wav')
    f.append('model', opts.model)
    f.append('language', opts.language ?? '')
    f.append('device', opts.device)
    f.append('compute_type', opts.compute_type)
    f.append('beam_size', String(opts.beam_size))
    f.append('vad', String(opts.vad))
    return request<{ text: string; language: string; language_code: string }>('POST', '/asr/transcribe', f)
  },
  voices: {
    list: () => request<Voice[]>('GET', '/voices'),
    create: (wav: Blob, name: string, text: string, language: string, source: string) => {
      const f = new FormData()
      f.append('file', wav, 'voice.wav')
      f.append('name', name)
      f.append('text', text)
      f.append('language', language)
      f.append('source', source)
      return request<Voice>('POST', '/voices', f)
    },
    update: (id: string, patch: Partial<Voice>) => request<Voice>('PATCH', `/voices/${id}`, patch),
    remove: (id: string) => request<void>('DELETE', `/voices/${id}`),
    exportTo: (id: string, path: string) => request<void>('POST', `/voices/${id}/export`, { path }),
    importFrom: (path: string) => request<Voice>('POST', '/voices/import', { path }),
    fromHistory: (history_id: string, name: string) => request<Voice>('POST', '/voices/from-history', { history_id, name }),
    audioUrl: (id: string) => fileUrl(`/voices/${id}/audio`)
  },
  history: {
    list: (q = '', offset = 0, limit = 200) =>
      request<{ total: number; items: HistoryItem[] }>('GET', `/history?offset=${offset}&limit=${limit}&q=${encodeURIComponent(q)}`),
    remove: (id: string) => request<void>('DELETE', `/history/${id}`),
    clear: () => request<void>('DELETE', '/history'),
    exportTo: (id: string, path: string, format: string) => request<void>('POST', `/history/${id}/export`, { path, format }),
    audioUrl: (id: string) => fileUrl(`/history/${id}/audio`)
  },
  compat: (body: { enabled: boolean; host: string; port: number; preset: Record<string, unknown> }) =>
    request<{ running: boolean; host: string | null; port: number | null }>('POST', '/compat', body)
}

export interface GenHandle {
  stop(): void
  close(): void
}

export function generate(req: GenRequest, onEvent: (e: GenEvent) => void, onAudio: (pcm: Float32Array) => void): GenHandle {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/ws/generate?token=${token}`)
  ws.binaryType = 'arraybuffer'
  let finished = false
  ws.onopen = () => ws.send(JSON.stringify(req))
  ws.onmessage = (m) => {
    if (m.data instanceof ArrayBuffer) onAudio(new Float32Array(m.data))
    else {
      const e = JSON.parse(m.data as string) as GenEvent
      if (e.type === 'done' || e.type === 'stopped' || e.type === 'error') finished = true
      onEvent(e)
    }
  }
  ws.onclose = () => {
    if (!finished) onEvent({ type: 'error', code: 'disconnected', message: 'Соединение с движком прервалось' })
  }
  return {
    stop: () => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'stop' }))
    },
    close: () => {
      finished = true
      ws.close()
    }
  }
}
