import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const UV_VERSION = '0.12.21'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const binDir = join(root, 'resources', 'bin')
const target = join(binDir, 'uv.exe')
const stamp = join(binDir, 'uv.version')

if (existsSync(target) && existsSync(stamp) && readFileSync(stamp, 'utf8') === UV_VERSION) {
  console.log(`uv ${UV_VERSION} already present`)
  process.exit(0)
}

const url = `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-x86_64-pc-windows-msvc.zip`
console.log(`Downloading ${url}`)
const res = await fetch(url)
if (!res.ok) throw new Error(`HTTP ${res.status}`)
const work = join(tmpdir(), `uv-${UV_VERSION}-${Date.now()}`)
mkdirSync(work, { recursive: true })
const zip = join(work, 'uv.zip')
writeFileSync(zip, Buffer.from(await res.arrayBuffer()))
execFileSync(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', zip, '-C', work])
mkdirSync(binDir, { recursive: true })
writeFileSync(target, readFileSync(join(work, 'uv.exe')))
writeFileSync(stamp, UV_VERSION)
rmSync(work, { recursive: true, force: true })
console.log(`uv ${UV_VERSION} -> ${target}`)
