import type { GenParams, LoadOptions, Settings } from './types'

export const DEFAULT_PARAMS: GenParams = {
  temperature: 0.9,
  top_k: 50,
  top_p: 1.0,
  do_sample: true,
  repetition_penalty: 1.05,
  max_new_tokens: 2048,
  min_new_tokens: 2,
  chunk_size: 8,
  non_streaming_mode: null,
  append_silence: true,
  xvec_only: false,
  seed: null,
  split: true,
  split_chars: 500,
  decode_context: 25,
  vram_cap_gb: null
}

export const DEFAULT_LOAD: LoadOptions = { max_seq_len: 2048, offload_embedding: true, repack: true, attn: 'sdpa' }

export const defaultSettings = (): Settings => ({
  dataDir: null,
  devMode: false,
  mode: 'clone',
  size: '0.6B',
  language: 'Auto',
  voiceId: null,
  speaker: 'ryan',
  expressiveness: 0.5,
  whisperModel: 'large-v3-turbo',
  whisperDevice: 'cuda',
  whisperComputeType: 'int8_float16',
  whisperBeam: 5,
  whisperVad: true,
  load: { ...DEFAULT_LOAD },
  params: { ...DEFAULT_PARAMS },
  vramCap: { '0.6B': 2.5, '1.7B': null },
  presets: [],
  api: {
    enabled: false,
    host: '127.0.0.1',
    port: 2027,
    mode: 'clone',
    voiceId: null,
    speaker: 'ryan',
    instruct: '',
    language: 'Auto'
  },
  autoUpdate: true,
  hfEndpoint: 'https://huggingface.co',
  settingsVersion: 2,
  lastSeenVersion: null
})
