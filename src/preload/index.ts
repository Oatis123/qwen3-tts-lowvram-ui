import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { QtsApi } from '../shared/types'

const on =
  <T>(channel: string) =>
  (cb: (payload: T) => void) => {
    const handler = (_e: unknown, payload: T): void => cb(payload)
    ipcRenderer.on(channel, handler)
    return () => {
      ipcRenderer.removeListener(channel, handler)
    }
  }

const api: QtsApi = {
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    catalog: () => ipcRenderer.invoke('app:catalog'),
    devtools: () => ipcRenderer.invoke('app:devtools')
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
    reset: () => ipcRenderer.invoke('settings:reset')
  },
  gpu: { check: () => ipcRenderer.invoke('gpu:check') },
  runtime: {
    status: () => ipcRenderer.invoke('runtime:status'),
    install: () => ipcRenderer.invoke('runtime:install'),
    cancel: () => ipcRenderer.invoke('runtime:cancel'),
    onProgress: on('runtime:progress')
  },
  models: {
    list: () => ipcRenderer.invoke('models:list'),
    download: (key) => ipcRenderer.invoke('models:download', key),
    cancel: (key) => ipcRenderer.invoke('models:cancel', key),
    remove: (key) => ipcRenderer.invoke('models:remove', key),
    onProgress: on('models:progress')
  },
  backend: {
    info: () => ipcRenderer.invoke('backend:info'),
    start: () => ipcRenderer.invoke('backend:start'),
    restart: () => ipcRenderer.invoke('backend:restart'),
    logs: () => ipcRenderer.invoke('backend:logs'),
    onState: on('backend:state'),
    onLog: on('backend:log')
  },
  dialog: {
    save: (name, filters) => ipcRenderer.invoke('dialog:save', name, filters),
    open: (filters) => ipcRenderer.invoke('dialog:open', filters),
    folder: () => ipcRenderer.invoke('dialog:folder')
  },
  shell: {
    openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
  },
  updater: {
    state: () => ipcRenderer.invoke('updater:state'),
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    onState: on('updater:state')
  },
  pathForFile: (file) => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('qts', api)
