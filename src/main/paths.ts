import { app } from 'electron'
import { accessSync, constants, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

function writable(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true })
    accessSync(dir, constants.W_OK)
    return true
  } catch {
    return false
  }
}

let cachedHome: string | null = null
let fallback = false

export function home(): string {
  if (cachedHome) return cachedHome
  if (process.env.QTS_HOME) cachedHome = process.env.QTS_HOME
  else if (!app.isPackaged) cachedHome = app.getPath('userData')
  else {
    const portable = join(dirname(process.execPath), 'UserData')
    if (writable(portable)) cachedHome = portable
    else {
      fallback = true
      cachedHome = join(process.env.LOCALAPPDATA || app.getPath('appData'), 'Qwen TTS Studio')
    }
  }
  return cachedHome
}

export const homeIsFallback = (): boolean => (home(), fallback)
export const runtimeDir = (): string => join(home(), 'runtime')
export const cacheDir = (): string => join(home(), 'cache')
export const venvPython = (): string => join(runtimeDir(), 'venv', 'Scripts', 'python.exe')

const resourceRoot = (): string => (app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources'))

export const backendDir = (): string =>
  app.isPackaged ? join(process.resourcesPath, 'backend') : join(app.getAppPath(), 'backend')

export const uvExe = (): string => join(resourceRoot(), 'bin', 'uv.exe')
export const catalogPath = (): string => join(backendDir(), 'catalog.json')
export const lockPath = (): string => join(backendDir(), 'requirements.lock')
