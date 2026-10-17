import { create } from 'zustand'
import { DEFAULT_LOAD, DEFAULT_PARAMS } from '../../shared/defaults'
import type {
  AppInfo,
  BackendInfo,
  Catalog,
  GpuInfo,
  ModelEntryState,
  Mode,
  RuntimeStatus,
  Settings,
  Size,
  UpdaterState
} from '../../shared/types'
import { api, ApiError, configure, generate, type GenHandle, type GenRequest, type GenStats, type HistoryItem, type ModelStatus, type Stats, type Voice } from './lib/api'
import { WavePlayer } from './lib/player'
import { t } from './i18n'

export type Page = 'generate' | 'voices' | 'history' | 'models' | 'settings' | 'dev'

export interface Toast {
  id: number
  text: string
  kind: 'ok' | 'error' | 'info'
}

interface AppState {
  booted: boolean
  needsSetup: boolean
  settings: Settings
  catalog: Catalog
  info: AppInfo | null
  gpu: GpuInfo | null
  runtime: RuntimeStatus | null
  backend: BackendInfo
  models: ModelEntryState[]
  voices: Voice[]
  status: ModelStatus | null
  asr: string | null
  stats: Stats | null
  updater: UpdaterState
  page: Page
  toasts: Toast[]
  historyVersion: number
  boot(): Promise<void>
  finishSetup(): Promise<void>
  patch(p: Partial<Settings>): Promise<void>
  go(page: Page): void
  toast(text: string, kind?: Toast['kind']): void
  refreshModels(): Promise<void>
  refreshVoices(): Promise<void>
  refreshStatus(): Promise<void>
  startBackend(): Promise<void>
  downloadModel(key: string): Promise<void>
  loadModel(key: string): Promise<void>
  unloadModel(): Promise<void>
}

const emptyCatalog: Catalog = { tts: [], whisper: [], speakers: [], languages: [] }
let toastId = 0

export const modelKey = (mode: Mode, size: Size): string => `${mode}-${mode === 'design' ? '1.7B' : size}`

export const useApp = create<AppState>((set, get) => ({
  booted: false,
  needsSetup: false,
  settings: null as unknown as Settings,
  catalog: emptyCatalog,
  info: null,
  gpu: null,
  runtime: null,
  backend: { state: 'stopped', port: null, token: null },
  models: [],
  voices: [],
  status: null,
  asr: null,
  stats: null,
  updater: { state: 'idle' },
  page: 'generate',
  toasts: [],
  historyVersion: 0,

  async boot() {
    const q = window.qts
    const [settings, catalog, info, runtime, models, backend, updater] = await Promise.all([
      q.settings.get(),
      q.app.catalog(),
      q.app.info(),
      q.runtime.status(),
      q.models.list(),
      q.backend.info(),
      q.updater.state()
    ])
    const whisperReady = !!models.find((m) => m.key === `whisper-${settings.whisperModel}`)?.downloaded
    set({ settings, catalog, info, runtime, models, backend, updater, needsSetup: !runtime.upToDate || !whisperReady, booted: true })

    q.backend.onState((b) => {
      set({ backend: b })
      if (b.state === 'ready' && b.port && b.token) {
        configure(b.port, b.token)
        void get().refreshVoices()
        void get().refreshStatus()
        void syncCompat()
      }
    })
    q.models.onProgress((p) => {
      set({
        models: get().models.map((m) =>
          m.key === p.key
            ? {
                ...m,
                downloading: p.state === 'downloading',
                downloaded: p.state === 'done' ? true : m.downloaded,
                received: p.received,
                total: p.total,
                speed: p.speed,
                error: p.state === 'error' ? p.error : undefined
              }
            : m
        )
      })
      if (p.state === 'error') get().toast(`Не удалось скачать модель: ${p.error}`, 'error')
      if (p.state !== 'downloading') void get().refreshModels()
    })
    q.updater.onState((u) => set({ updater: u }))
    if (!get().needsSetup) await get().startBackend()
  },

  async finishSetup() {
    const [runtime, models] = await Promise.all([window.qts.runtime.status(), window.qts.models.list()])
    set({ runtime, models, needsSetup: false })
    await get().startBackend()
  },

  async startBackend() {
    const b = await window.qts.backend.start()
    set({ backend: b })
    if (b.state === 'ready' && b.port && b.token) {
      configure(b.port, b.token)
      await Promise.all([get().refreshVoices(), get().refreshStatus()])
      void syncCompat()
    }
  },

  async patch(p) {
    set({ settings: { ...get().settings, ...p } })
    const settings = await window.qts.settings.set(p)
    set({ settings })
    if ('api' in p || 'devMode' in p) void syncCompat()
  },

  go(page) {
    set({ page })
  },

  toast(text, kind = 'info') {
    const id = ++toastId
    set({ toasts: [...get().toasts, { id, text, kind }] })
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), kind === 'error' ? 7000 : 3500)
  },

  async refreshModels() {
    set({ models: await window.qts.models.list() })
  },

  async refreshVoices() {
    try {
      set({ voices: await api.voices.list() })
    } catch {
      /* backend not ready */
    }
  },

  async refreshStatus() {
    try {
      const s = await api.status()
      set({ status: s.model, asr: s.asr })
    } catch {
      /* backend not ready */
    }
  },

  async loadModel(key) {
    const { settings, status } = get()
    set({ status: { state: 'loading', model_id: key, error: null, busy: false, load: status?.load ?? null } })
    try {
      await api.loadModel(key, settings.devMode ? settings.load : { ...DEFAULT_LOAD })
    } catch (e) {
      if (!(e instanceof ApiError && e.code === 'busy')) get().toast((e as Error).message, 'error')
    } finally {
      await get().refreshStatus()
    }
  },

  async unloadModel() {
    try {
      await api.unloadModel()
      get().toast(t.sidebar.unloaded, 'ok')
    } catch (e) {
      get().toast((e as Error).message, 'error')
    } finally {
      await get().refreshStatus()
    }
  },

  async downloadModel(key) {
    await window.qts.models.download(key)
    set({ models: get().models.map((m) => (m.key === key ? { ...m, downloading: true, received: 0, error: undefined } : m)) })
  }
}))

async function syncCompat(): Promise<void> {
  const { settings, backend, catalog } = useApp.getState()
  if (backend.state !== 'ready') return
  const a = settings.api
  const enabled = a.enabled && settings.devMode
  const size = a.mode === 'design' ? '1.7B' : settings.size
  const preset = {
    mode: a.mode,
    size,
    language: a.language,
    voice_id: a.voiceId,
    speaker: a.speaker,
    instruct: a.instruct,
    params: { ...settings.params, vram_cap_gb: capFor(settings, catalog, a.mode, size), seed: null },
    load: settings.load
  }
  try {
    await api.compat({ enabled, host: a.host, port: a.port, preset })
  } catch (e) {
    useApp.getState().toast(`API: ${(e as Error).message}`, 'error')
  }
}

export function capFor(s: Settings, catalog: Catalog, mode: Mode, size: Size): number | null {
  if (s.devMode) return s.vramCap[size]
  return catalog.tts.find((m) => m.id === modelKey(mode, size))?.vramCap ?? null
}

export interface Draft {
  text: string
  instruct: string
  design: string
}

export type Phase = 'idle' | 'connecting' | 'loading' | 'generating' | 'done' | 'stopped' | 'error'

interface GenState {
  draft: Draft
  phase: Phase
  segment: number
  segments: number
  error: string | null
  missingModel: string | null
  item: HistoryItem | null
  stats: GenStats | null
  lastSeed: number | null
  lastRequest: GenRequest | null
  setDraft(p: Partial<Draft>): void
  start(opts?: { newSeed?: boolean }): void
  stop(): void
  showItem(item: HistoryItem, samples: Float32Array): void
}

export const player = new WavePlayer()
let handle: GenHandle | null = null

export function buildRequest(s: Settings, catalog: Catalog, draft: Draft, newSeed = false): GenRequest {
  const mode = s.mode
  const size: Size = mode === 'design' ? '1.7B' : s.size
  const params = s.devMode ? { ...s.params } : { ...DEFAULT_PARAMS, temperature: +(0.6 + 0.6 * s.expressiveness).toFixed(2) }
  if (newSeed) params.seed = null
  params.vram_cap_gb = capFor(s, catalog, mode, size)
  const instruct = mode === 'design' ? draft.design : mode === 'custom' || s.devMode ? draft.instruct : ''
  return {
    mode,
    size,
    text: draft.text,
    language: s.language,
    voice_id: mode === 'clone' ? s.voiceId : null,
    speaker: mode === 'custom' ? s.speaker : null,
    instruct: instruct.trim() || null,
    params,
    load: s.devMode ? { ...s.load } : { ...DEFAULT_LOAD }
  }
}

export const useGen = create<GenState>((set, get) => ({
  draft: { text: '', instruct: '', design: '' },
  phase: 'idle',
  segment: 0,
  segments: 0,
  error: null,
  missingModel: null,
  item: null,
  stats: null,
  lastSeed: null,
  lastRequest: null,

  setDraft(p) {
    set({ draft: { ...get().draft, ...p } })
  },

  start(opts = {}) {
    const app = useApp.getState()
    if (app.backend.state !== 'ready') return
    handle?.close()
    const req = buildRequest(app.settings, app.catalog, get().draft, opts.newSeed)
    set({ phase: 'connecting', error: null, missingModel: null, segment: 0, segments: 0, item: null, stats: null, lastRequest: req })
    player.beginStream(true)
    handle = generate(
      req,
      (e) => {
        switch (e.type) {
          case 'loading':
            set({ phase: 'loading' })
            break
          case 'start':
            set({ phase: 'generating', segments: e.segments, lastSeed: e.seed })
            void app.refreshStatus()
            break
          case 'segment':
            set({ segment: e.index })
            break
          case 'done':
            player.endStream()
            set({ phase: 'done', item: e.item, stats: e.stats, lastSeed: e.seed })
            useApp.setState((s) => ({ historyVersion: s.historyVersion + 1 }))
            handle = null
            break
          case 'stopped':
            player.endStream()
            set({ phase: 'stopped', stats: e.stats })
            handle = null
            break
          case 'error':
            player.endStream()
            player.stop()
            if (e.code === 'model_missing') set({ phase: 'idle', missingModel: req.mode === 'design' ? 'design-1.7B' : `${req.mode}-${req.size}` })
            else set({ phase: 'error', error: e.message })
            void app.refreshStatus()
            handle = null
            break
        }
      },
      (pcm) => player.push(pcm)
    )
  },

  stop() {
    handle?.stop()
    player.stop()
  },

  showItem(item, samples) {
    handle?.close()
    handle = null
    player.load(samples)
    set({ phase: 'done', item, stats: item.stats, error: null, missingModel: null, lastSeed: item.seed })
  }
}))
