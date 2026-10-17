import { net } from 'electron'
import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Catalog, DownloadProgress, ModelEntryState } from '../shared/types'
import { getSettings, modelsDir } from './settings'

interface RepoFile {
  path: string
  size: number
}

interface Job {
  controller: AbortController
  received: number
  total: number
  speed: number
}

const jobs = new Map<string, Job>()
const errors = new Map<string, string>()

export const repoDir = (repo: string): string => join(modelsDir(), repo.replace('/', '--'))
const completeMarker = (repo: string): string => join(repoDir(repo), '.complete')

export function entries(catalog: Catalog): { key: string; repo: string; bytes: number }[] {
  return [
    ...catalog.tts.map((m) => ({ key: m.id, repo: m.repo, bytes: m.bytes })),
    ...catalog.whisper.map((m) => ({ key: `whisper-${m.id}`, repo: m.repo, bytes: m.bytes }))
  ]
}

export function isDownloaded(repo: string): boolean {
  return existsSync(completeMarker(repo))
}

export function listModels(catalog: Catalog): ModelEntryState[] {
  return entries(catalog).map((e) => {
    const job = jobs.get(e.key)
    return {
      ...e,
      downloaded: isDownloaded(e.repo),
      downloading: !!job,
      received: job?.received,
      total: job?.total,
      speed: job?.speed,
      error: errors.get(e.key)
    }
  })
}

const endpoint = (): string => getSettings().hfEndpoint.replace(/\/+$/, '') || 'https://huggingface.co'

async function listRepo(repo: string, signal: AbortSignal): Promise<RepoFile[]> {
  const res = await net.fetch(`${endpoint()}/api/models/${repo}/tree/main?recursive=1`, { signal })
  if (!res.ok) throw new Error(`HuggingFace: HTTP ${res.status}`)
  const items = (await res.json()) as { type: string; path: string; size: number }[]
  return items.filter((i) => i.type === 'file' && i.path !== '.gitattributes').map((i) => ({ path: i.path, size: i.size }))
}

async function fetchFile(repo: string, file: RepoFile, dest: string, signal: AbortSignal, onBytes: (n: number) => void): Promise<void> {
  if (existsSync(dest) && statSync(dest).size === file.size) {
    onBytes(file.size)
    return
  }
  mkdirSync(dirname(dest), { recursive: true })
  const part = dest + '.part'
  let offset = existsSync(part) ? statSync(part).size : 0
  if (offset > file.size) {
    rmSync(part)
    offset = 0
  }
  const url = `${endpoint()}/${repo}/resolve/main/${file.path.split('/').map(encodeURIComponent).join('/')}`
  const res = await net.fetch(url, { signal, headers: offset ? { Range: `bytes=${offset}-` } : {} })
  if (res.status === 200 && offset) offset = 0
  else if (!res.ok) throw new Error(`HTTP ${res.status}: ${file.path}`)
  onBytes(offset)
  const out = createWriteStream(part, { flags: offset ? 'a' : 'w' })
  const reader = res.body!.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!out.write(value)) await new Promise<void>((r) => out.once('drain', () => r()))
      onBytes(value.byteLength)
    }
  } finally {
    await new Promise<void>((r) => out.end(r))
  }
  if (statSync(part).size !== file.size) throw new Error(`incomplete: ${file.path}`)
  renameSync(part, dest)
}

export async function download(key: string, repo: string, emit: (p: DownloadProgress) => void): Promise<void> {
  if (jobs.has(key)) return
  const job: Job = { controller: new AbortController(), received: 0, total: 0, speed: 0 }
  jobs.set(key, job)
  errors.delete(key)
  const dir = repoDir(repo)
  let lastEmit = 0
  let windowStart = Date.now()
  let windowBytes = 0
  const tick = (force = false): void => {
    const now = Date.now()
    if (now - windowStart >= 1000) {
      job.speed = (windowBytes * 1000) / (now - windowStart)
      windowStart = now
      windowBytes = 0
    }
    if (force || now - lastEmit > 250) {
      lastEmit = now
      emit({ key, received: job.received, total: job.total, speed: job.speed, state: 'downloading' })
    }
  }
  try {
    const files = await listRepo(repo, job.controller.signal)
    job.total = files.reduce((a, f) => a + f.size, 0)
    tick(true)
    for (const f of files) {
      await fetchFile(repo, f, join(dir, f.path), job.controller.signal, (n) => {
        job.received += n
        windowBytes += n
        tick()
      })
    }
    writeFileSync(completeMarker(repo), JSON.stringify({ repo, files: files.length, at: Date.now() }))
    emit({ key, received: job.total, total: job.total, speed: 0, state: 'done' })
  } catch (e) {
    const aborted = job.controller.signal.aborted
    const message = (e as Error).message
    if (!aborted) errors.set(key, message)
    emit({ key, received: job.received, total: job.total, speed: 0, state: aborted ? 'cancelled' : 'error', error: aborted ? undefined : message })
  } finally {
    jobs.delete(key)
  }
}

export function cancelDownload(key: string): void {
  jobs.get(key)?.controller.abort()
}

export function removeModel(repo: string): void {
  const dir = repoDir(repo)
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
}

export function diskUsage(dir: string): number {
  if (!existsSync(dir)) return 0
  let total = 0
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    total += st.isDirectory() ? diskUsage(p) : st.size
  }
  return total
}
