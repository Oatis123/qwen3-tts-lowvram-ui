import { app } from 'electron'
import electronUpdater from 'electron-updater'
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, unlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { UpdaterState } from '../shared/types'
import { cacheDir } from './paths'

const { autoUpdater } = electronUpdater

let state: UpdaterState = { state: app.isPackaged ? 'idle' : 'disabled' }
let listener: (s: UpdaterState) => void = () => {}
let installWhenReady = false

const set = (s: UpdaterState): void => {
  state = s
  listener(s)
}

function install(): void {
  set({ state: 'installing', version: state.version })
  setImmediate(() => autoUpdater.quitAndInstall(true, true))
}

function adoptInstallerCopy(): void {
  if (!process.env.LOCALAPPDATA) return
  const src = join(process.env.LOCALAPPDATA, 'qwen-tts-studio-updater')
  const dest = join(cacheDir(), 'qwen-tts-studio-updater')
  if (resolve(src) === resolve(dest) || !existsSync(src)) return
  try {
    const file = join(src, 'installer.exe')
    if (existsSync(file)) {
      mkdirSync(dest, { recursive: true })
      try {
        renameSync(file, join(dest, 'installer.exe'))
      } catch {
        copyFileSync(file, join(dest, 'installer.exe'))
        unlinkSync(file)
      }
    }
    rmSync(src, { recursive: true, force: true })
  } catch {
    /* best effort */
  }
}

export function initUpdater(onState: (s: UpdaterState) => void, auto: boolean): void {
  listener = onState
  if (!app.isPackaged) return
  adoptInstallerCopy()
  const adapter = (autoUpdater as unknown as { app: object }).app
  Object.defineProperty(adapter, 'baseCachePath', { get: () => cacheDir() })
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.on('checking-for-update', () => set({ state: 'checking' }))
  autoUpdater.on('update-available', (i) => set({ state: 'available', version: i.version }))
  autoUpdater.on('update-not-available', () => set({ state: 'none' }))
  autoUpdater.on('download-progress', (p) => set({ state: 'downloading', version: state.version, percent: p.percent }))
  autoUpdater.on('update-downloaded', (i) => {
    set({ state: 'ready', version: i.version })
    if (installWhenReady) install()
  })
  autoUpdater.on('error', (e) => {
    installWhenReady = false
    set({ state: 'error', version: state.version, error: e.message })
  })
  if (auto) setTimeout(() => void checkUpdates(), 5000)
}

export async function checkUpdates(): Promise<UpdaterState> {
  if (!app.isPackaged) return state
  try {
    await autoUpdater.checkForUpdates()
  } catch (e) {
    set({ state: 'error', error: (e as Error).message })
  }
  return state
}

export const updaterState = (): UpdaterState => state

export async function installUpdate(): Promise<void> {
  if (!app.isPackaged) return
  if (state.state === 'ready') return install()
  if (state.state !== 'available' && state.state !== 'error') return
  installWhenReady = true
  set({ state: 'downloading', version: state.version, percent: 0 })
  try {
    await autoUpdater.downloadUpdate()
  } catch (e) {
    installWhenReady = false
    set({ state: 'error', version: state.version, error: (e as Error).message })
  }
}
