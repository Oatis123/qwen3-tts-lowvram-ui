import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Catalog, FileFilter, Settings } from '../shared/types'
import { backend } from './backend'
import { cancelDownload, download, entries, listModels, removeModel } from './downloads'
import { checkGpu } from './gpu'
import { cacheDir, catalogPath, home, homeIsFallback } from './paths'
import { cancelInstall, installRuntime, runtimeStatus } from './runtime'
import { dataDir, getSettings, modelsDir, resetSettings, setSettings } from './settings'
import { checkUpdates, initUpdater, installUpdate, updaterState } from './updater'

app.setPath('userData', join(home(), 'electron'))
app.setPath('crashDumps', join(cacheDir(), 'crashes'))

let win: BrowserWindow | null = null
const catalog = (): Catalog => JSON.parse(readFileSync(catalogPath(), 'utf8'))
const send = (channel: string, payload: unknown): void => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: '#0f1115',
    title: 'Qwen TTS Studio',
    icon: join(app.getAppPath(), 'build', 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#9aa3b2', height: 40 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })
  win.once('ready-to-show', () => win?.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) e.preventDefault()
  })
  win.webContents.on('before-input-event', (_e, input) => {
    const devAllowed = getSettings().devMode || !app.isPackaged
    if (input.type === 'keyDown' && input.control && input.shift && input.key.toLowerCase() === 'i' && devAllowed) {
      win?.webContents.toggleDevTools()
    }
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

function registerIpc(): void {
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    packaged: app.isPackaged,
    home: home(),
    homeFallback: homeIsFallback(),
    dataDir: dataDir(),
    modelsDir: modelsDir()
  }))
  ipcMain.handle('app:catalog', () => catalog())
  ipcMain.handle('app:devtools', () => win?.webContents.toggleDevTools())

  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', async (_e, patch: Partial<Settings>) => {
    const before = dataDir()
    const next = setSettings(patch)
    if (dataDir() !== before && backend.state !== 'stopped') await backend.restart()
    return next
  })
  ipcMain.handle('settings:reset', () => resetSettings())

  ipcMain.handle('gpu:check', () => checkGpu())

  ipcMain.handle('runtime:status', () => runtimeStatus())
  ipcMain.handle('runtime:install', async () => {
    await backend.stop()
    return installRuntime((p) => send('runtime:progress', p))
  })
  ipcMain.handle('runtime:cancel', () => cancelInstall())

  ipcMain.handle('models:list', () => listModels(catalog()))
  ipcMain.handle('models:download', (_e, key: string) => {
    const entry = entries(catalog()).find((m) => m.key === key)
    if (!entry) throw new Error(`unknown model ${key}`)
    void download(key, entry.repo, (p) => send('models:progress', p))
  })
  ipcMain.handle('models:cancel', (_e, key: string) => cancelDownload(key))
  ipcMain.handle('models:remove', (_e, key: string) => {
    const entry = entries(catalog()).find((m) => m.key === key)
    if (entry) removeModel(entry.repo)
  })

  ipcMain.handle('backend:info', () => backend.info())
  ipcMain.handle('backend:start', () => backend.start())
  ipcMain.handle('backend:restart', () => backend.restart())
  ipcMain.handle('backend:logs', () => backend.logs)

  ipcMain.handle('dialog:save', async (_e, defaultName: string, filters: FileFilter[]) => {
    const r = await dialog.showSaveDialog(win!, { defaultPath: defaultName, filters })
    return r.canceled ? null : r.filePath
  })
  ipcMain.handle('dialog:open', async (_e, filters: FileFilter[]) => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openFile'], filters })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('dialog:folder', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle('shell:openPath', (_e, p: string) => shell.openPath(p))
  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    if (/^https:\/\//.test(url)) return shell.openExternal(url)
  })

  ipcMain.handle('updater:state', () => updaterState())
  ipcMain.handle('updater:check', () => checkUpdates())
  ipcMain.handle('updater:install', () => installUpdate())

  backend.on('state', (info) => send('backend:state', info))
  backend.on('log', (line) => send('backend:log', line))
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.oatis123.qwenttsstudio')
    Menu.setApplicationMenu(null)
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'media'))
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media')
    registerIpc()
    createWindow()
    initUpdater((s) => send('updater:state', s), getSettings().autoUpdate)
  })

  app.on('window-all-closed', () => app.quit())
  let quitting = false
  app.on('before-quit', (e) => {
    if (quitting) return
    e.preventDefault()
    quitting = true
    cancelInstall()
    void backend.stop().finally(() => app.quit())
  })
}
