import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RuntimeProgress, RuntimeStatus } from '../shared/types'
import { cacheDir, lockPath, runtimeDir, uvExe, venvPython } from './paths'

const PYTHON = '3.12'
const INDEX = ['--index-url', 'https://pypi.org/simple', '--extra-index-url', 'https://download.pytorch.org/whl/cu128', '--index-strategy', 'unsafe-best-match']
const marker = (): string => join(runtimeDir(), 'installed.json')

const lockHash = (): string =>
  createHash('sha256').update(PYTHON).update(runtimeDir()).update(readFileSync(lockPath())).digest('hex')

export function runtimeStatus(): RuntimeStatus {
  const installed = existsSync(venvPython())
  let upToDate = false
  try {
    upToDate = installed && JSON.parse(readFileSync(marker(), 'utf8')).hash === lockHash()
  } catch {
    upToDate = false
  }
  return { installed, upToDate, venvPython: venvPython() }
}

let current: ChildProcess | null = null
let cancelled = false

function uvEnv(): NodeJS.ProcessEnv {
  const rt = runtimeDir()
  return {
    ...process.env,
    UV_PYTHON_INSTALL_DIR: join(rt, 'python'),
    UV_CACHE_DIR: join(cacheDir(), 'uv'),
    UV_PYTHON_BIN_DIR: join(rt, 'bin'),
    UV_TOOL_DIR: join(rt, 'tools'),
    UV_NO_CONFIG: '1',
    UV_PYTHON_PREFERENCE: 'only-managed',
    UV_NO_PROGRESS: '1',
    PYTHONUTF8: '1'
  }
}

function run(cmd: string, args: string[], onLine: (line: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    if (cancelled) return reject(new Error('cancelled'))
    const child = spawn(cmd, args, { env: uvEnv(), windowsHide: true })
    current = child
    const tail: string[] = []
    const feed = (buf: Buffer): void => {
      for (const raw of buf.toString('utf8').split(/\r?\n/)) {
        const line = raw.trim()
        if (!line) continue
        tail.push(line)
        if (tail.length > 30) tail.shift()
        onLine(line)
      }
    }
    child.stdout.on('data', feed)
    child.stderr.on('data', feed)
    child.on('error', reject)
    child.on('close', (code) => {
      current = null
      if (cancelled) reject(new Error('cancelled'))
      else if (code === 0) resolve()
      else reject(new Error(tail.slice(-8).join('\n') || `exit code ${code}`))
    })
  })
}

export async function installRuntime(emit: (p: RuntimeProgress) => void): Promise<boolean> {
  cancelled = false
  const uv = uvExe()
  mkdirSync(runtimeDir(), { recursive: true })
  try {
    emit({ stage: 'python', message: 'python' })
    await run(uv, ['python', 'install', PYTHON, '--no-bin', '--no-registry'], (line) => emit({ stage: 'python', message: 'python', line }))

    emit({ stage: 'venv', message: 'venv' })
    if (!runtimeStatus().upToDate) {
      await run(uv, ['venv', join(runtimeDir(), 'venv'), '--python', PYTHON, '--clear'], (line) => emit({ stage: 'venv', message: 'venv', line }))
    }

    emit({ stage: 'packages', message: 'packages' })
    await run(uv, ['pip', 'sync', '--python', venvPython(), lockPath(), ...INDEX], (line) =>
      emit({ stage: 'packages', message: 'packages', line })
    )

    emit({ stage: 'verify', message: 'verify' })
    let cuda = ''
    await run(venvPython(), ['-c', 'import torch, ctranslate2, faster_qwen3_tts, faster_whisper, qwen3_tts_lowvram; print("CUDA", torch.cuda.is_available())'], (line) => {
      if (line.startsWith('CUDA')) cuda = line
      emit({ stage: 'verify', message: 'verify', line })
    })
    writeFileSync(marker(), JSON.stringify({ hash: lockHash(), at: Date.now(), cuda }))
    emit({ stage: 'done', message: 'done' })
    return true
  } catch (e) {
    emit({ stage: 'error', message: (e as Error).message })
    return false
  }
}

export function cancelInstall(): void {
  cancelled = true
  if (current?.pid) spawn('taskkill', ['/pid', String(current.pid), '/T', '/F'], { windowsHide: true })
}
