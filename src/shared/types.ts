export type Mode = 'clone' | 'custom' | 'design'
export type Size = '0.6B' | '1.7B'

export interface TtsModel {
  id: string
  mode: Mode
  size: Size
  repo: string
  bytes: number
  vramCap: number | null
}

export interface WhisperModel {
  id: string
  repo: string
  bytes: number
}

export interface Speaker {
  id: string
  name: string
  native: string
  gender: 'm' | 'f'
}

export interface Catalog {
  tts: TtsModel[]
  whisper: WhisperModel[]
  speakers: Speaker[]
  languages: string[]
}

export interface GenParams {
  temperature: number
  top_k: number
  top_p: number
  do_sample: boolean
  repetition_penalty: number
  max_new_tokens: number
  min_new_tokens: number
  chunk_size: number
  non_streaming_mode: boolean | null
  append_silence: boolean
  xvec_only: boolean
  seed: number | null
  split: boolean
  split_chars: number
  decode_context: number
  vram_cap_gb: number | null
}

export interface LoadOptions {
  max_seq_len: number
  offload_embedding: boolean
  repack: boolean
  attn: 'sdpa' | 'eager'
}

export interface ApiSettings {
  enabled: boolean
  host: string
  port: number
  mode: Mode
  voiceId: string | null
  speaker: string | null
  instruct: string
  language: string
}

export interface ParamPreset {
  name: string
  params: Partial<GenParams>
}

export interface Settings {
  dataDir: string | null
  devMode: boolean
  mode: Mode
  size: Size
  language: string
  voiceId: string | null
  speaker: string | null
  expressiveness: number
  whisperModel: string
  whisperDevice: 'cuda' | 'cpu'
  whisperComputeType: string
  whisperBeam: number
  whisperVad: boolean
  load: LoadOptions
  params: GenParams
  vramCap: Record<Size, number | null>
  presets: ParamPreset[]
  api: ApiSettings
  autoUpdate: boolean
  hfEndpoint: string
}

export interface GpuInfo {
  ok: boolean
  name?: string
  vramMb?: number
  driver?: string
  driverOk?: boolean
  error?: string
}

export interface RuntimeStatus {
  installed: boolean
  upToDate: boolean
  venvPython: string
}

export interface RuntimeProgress {
  stage: 'python' | 'venv' | 'packages' | 'verify' | 'done' | 'error'
  message: string
  line?: string
  done?: number
  total?: number
}

export interface ModelEntryState {
  key: string
  repo: string
  bytes: number
  downloaded: boolean
  downloading: boolean
  received?: number
  total?: number
  speed?: number
  error?: string
}

export interface DownloadProgress {
  key: string
  received: number
  total: number
  speed: number
  state: 'downloading' | 'done' | 'error' | 'cancelled'
  error?: string
}

export type BackendState = 'stopped' | 'starting' | 'ready' | 'error'

export interface BackendInfo {
  state: BackendState
  port: number | null
  token: string | null
  error?: string
}

export interface UpdaterState {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'installing' | 'none' | 'error' | 'disabled'
  version?: string
  percent?: number
  error?: string
}

export interface AppInfo {
  version: string
  packaged: boolean
  home: string
  homeFallback: boolean
  dataDir: string
  modelsDir: string
}

export interface FileFilter {
  name: string
  extensions: string[]
}

export interface QtsApi {
  app: {
    info(): Promise<AppInfo>
    catalog(): Promise<Catalog>
    devtools(): Promise<void>
  }
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
    reset(): Promise<Settings>
  }
  gpu: { check(): Promise<GpuInfo> }
  runtime: {
    status(): Promise<RuntimeStatus>
    install(): Promise<boolean>
    cancel(): Promise<void>
    onProgress(cb: (p: RuntimeProgress) => void): () => void
  }
  models: {
    list(): Promise<ModelEntryState[]>
    download(key: string): Promise<void>
    cancel(key: string): Promise<void>
    remove(key: string): Promise<void>
    onProgress(cb: (p: DownloadProgress) => void): () => void
  }
  backend: {
    info(): Promise<BackendInfo>
    start(): Promise<BackendInfo>
    restart(): Promise<BackendInfo>
    logs(): Promise<string[]>
    onState(cb: (info: BackendInfo) => void): () => void
    onLog(cb: (line: string) => void): () => void
  }
  dialog: {
    save(defaultName: string, filters: FileFilter[]): Promise<string | null>
    open(filters: FileFilter[]): Promise<string | null>
    folder(): Promise<string | null>
  }
  shell: {
    openPath(path: string): Promise<void>
    openExternal(url: string): Promise<void>
  }
  updater: {
    state(): Promise<UpdaterState>
    check(): Promise<UpdaterState>
    install(): Promise<void>
    onState(cb: (s: UpdaterState) => void): () => void
  }
  pathForFile(file: File): string
}
