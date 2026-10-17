import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { Settings } from '../shared/types'
import { defaultSettings } from '../shared/defaults'
import { home } from './paths'

export const defaults = defaultSettings

const file = (): string => join(home(), 'settings.json')
let cache: Settings | null = null

function merge<T>(base: T, patch: unknown): T {
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return (patch ?? base) as T
  if (typeof patch !== 'object' || patch === null) return base
  const out = { ...base } as Record<string, unknown>
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (!(k in out)) continue
    out[k] = merge(out[k], v)
  }
  return out as T
}

export function getSettings(): Settings {
  if (cache) return cache
  let stored: unknown = {}
  try {
    if (existsSync(file())) stored = JSON.parse(readFileSync(file(), 'utf8'))
  } catch {
    stored = {}
  }
  cache = merge(defaults(), stored)
  if (!existsSync(file())) {
    cache.lastSeenVersion = app.getVersion()
    mkdirSync(home(), { recursive: true })
    writeFileSync(file(), JSON.stringify(cache, null, 2))
  }
  const version = (stored as { settingsVersion?: number }).settingsVersion ?? 1
  if (version < 2 && existsSync(file())) {
    if (cache.params.split_chars === 220) cache.params.split_chars = 500
    if (cache.load.max_seq_len === 1024) cache.load.max_seq_len = 2048
    cache.settingsVersion = 2
    writeFileSync(file(), JSON.stringify(cache, null, 2))
  }
  return cache
}

export function setSettings(patch: Partial<Settings>): Settings {
  cache = merge(getSettings(), patch)
  mkdirSync(home(), { recursive: true })
  const tmp = file() + '.tmp'
  writeFileSync(tmp, JSON.stringify(cache, null, 2))
  renameSync(tmp, file())
  return cache
}

export function resetSettings(): Settings {
  const { dataDir, lastSeenVersion, settingsVersion } = getSettings()
  cache = null
  writeFileSync(file(), JSON.stringify({ dataDir, lastSeenVersion, settingsVersion }, null, 2))
  return getSettings()
}

export const dataDir = (): string => getSettings().dataDir || join(home(), 'data')
export const modelsDir = (): string => join(dataDir(), 'models')
