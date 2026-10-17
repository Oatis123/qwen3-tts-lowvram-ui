import { app } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdaterState } from '../shared/types'
import { cacheDir } from './paths'

const { autoUpdater } = electronUpdater

let state: UpdaterState = { state: app.isPackaged ? 'idle' : 'disabled' }
let listener: (s: UpdaterState) => void = () => {}

const set = (s: UpdaterState): void => {
  state = s
  listener(s)
}

export function initUpdater(onState: (s: UpdaterState) => void, auto: boolean): void {
  listener = onState
  if (!app.isPackaged) return
  const adapter = (autoUpdater as unknown as { app: object }).app
  Object.defineProperty(adapter, 'baseCachePath', { get: () => cacheDir() })
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => set({ state: 'checking' }))
  autoUpdater.on('update-available', (i) => set({ state: 'available', version: i.version }))
  autoUpdater.on('update-not-available', () => set({ state: 'none' }))
  autoUpdater.on('download-progress', (p) => set({ state: 'downloading', version: state.version, percent: p.percent }))
  autoUpdater.on('update-downloaded', (i) => set({ state: 'ready', version: i.version }))
  autoUpdater.on('error', (e) => set({ state: 'error', error: e.message }))
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
export const installUpdate = (): void => autoUpdater.quitAndInstall()
