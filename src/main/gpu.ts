import { execFile } from 'node:child_process'
import type { GpuInfo } from '../shared/types'

const MIN_DRIVER = 528.33

export function checkGpu(): Promise<GpuInfo> {
  return new Promise((resolve) => {
    execFile(
      'nvidia-smi',
      ['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader,nounits'],
      { windowsHide: true, timeout: 15000 },
      (err, stdout) => {
        if (err) return resolve({ ok: false, error: 'nvidia-smi not found' })
        const line = stdout.trim().split(/\r?\n/)[0] ?? ''
        const [name, mem, driver] = line.split(',').map((s) => s.trim())
        if (!name) return resolve({ ok: false, error: 'no gpu' })
        resolve({
          ok: true,
          name,
          vramMb: Number(mem),
          driver,
          driverOk: Number.parseFloat(driver) >= MIN_DRIVER
        })
      }
    )
  })
}
