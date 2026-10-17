import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { createServer } from 'node:net'
import { join } from 'node:path'
import type { BackendInfo, BackendState } from '../shared/types'
import { backendDir, cacheDir, venvPython } from './paths'
import { dataDir, modelsDir } from './settings'

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      srv.close(() => resolve(port))
    })
  })

class Backend extends EventEmitter {
  state: BackendState = 'stopped'
  port: number | null = null
  token: string | null = null
  error: string | undefined
  logs: string[] = []
  private child: ChildProcess | null = null
  private starting: Promise<BackendInfo> | null = null

  info(): BackendInfo {
    return { state: this.state, port: this.port, token: this.token, error: this.error }
  }

  private set(state: BackendState, error?: string): void {
    this.state = state
    this.error = error
    this.emit('state', this.info())
  }

  private log(line: string): void {
    this.logs.push(line)
    if (this.logs.length > 3000) this.logs.splice(0, this.logs.length - 3000)
    this.emit('log', line)
  }

  start(): Promise<BackendInfo> {
    if (this.state === 'ready') return Promise.resolve(this.info())
    if (this.starting) return this.starting
    this.starting = this.spawn().finally(() => (this.starting = null))
    return this.starting
  }

  private async spawn(): Promise<BackendInfo> {
    this.port = await freePort()
    this.token = randomBytes(24).toString('hex')
    this.set('starting')
    const args = [
      join(backendDir(), 'main.py'),
      '--port', String(this.port),
      '--token', this.token,
      '--data-dir', dataDir(),
      '--models-dir', modelsDir()
    ]
    const child = spawn(venvPython(), args, {
      cwd: backendDir(),
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
        PYTHONDONTWRITEBYTECODE: '1',
        PYTHONNOUSERSITE: '1',
        HF_HUB_OFFLINE: '1',
        HF_HOME: join(cacheDir(), 'huggingface'),
        TORCH_HOME: join(cacheDir(), 'torch'),
        CUDA_CACHE_PATH: join(cacheDir(), 'nv'),
        XDG_CACHE_HOME: cacheDir(),
        NUMBA_CACHE_DIR: join(cacheDir(), 'numba'),
        MPLCONFIGDIR: join(cacheDir(), 'matplotlib')
      }
    })
    this.child = child
    return new Promise((resolve) => {
      let tail = ''
      const onData = (buf: Buffer): void => {
        tail += buf.toString('utf8')
        const lines = tail.split(/\r?\n/)
        tail = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          this.log(line)
          if (line.startsWith('QTS_READY') && this.state === 'starting') {
            this.set('ready')
            resolve(this.info())
          }
        }
      }
      child.stdout?.on('data', onData)
      child.stderr?.on('data', onData)
      child.on('error', (e) => {
        this.set('error', e.message)
        resolve(this.info())
      })
      child.on('exit', (code) => {
        if (this.child !== child) return
        this.child = null
        const last = this.logs.slice(-12).join('\n')
        if (code === 0 || this.state === 'stopped') this.set('stopped')
        else this.set('error', `exit ${code}\n${last}`)
        resolve(this.info())
      })
    })
  }

  stop(): Promise<void> {
    const child = this.child
    this.child = null
    this.set('stopped')
    if (!child?.pid) return Promise.resolve()
    return new Promise((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
      killer.on('close', () => resolve())
      killer.on('error', () => {
        child.kill()
        resolve()
      })
    })
  }

  async restart(): Promise<BackendInfo> {
    await this.stop()
    return this.start()
  }
}

export const backend = new Backend()
