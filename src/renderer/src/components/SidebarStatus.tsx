import { Download, X } from 'lucide-react'
import { useState } from 'react'
import { t } from '../i18n'
import { bytes, gib } from '../lib/format'
import { modelName } from '../lib/models'
import { useApp } from '../store'
import { cx, Progress, Spinner } from './ui'

function Downloads() {
  const models = useApp((s) => s.models)
  const catalog = useApp((s) => s.catalog)
  const active = models.filter((m) => m.downloading)
  if (!active.length) return null
  return (
    <div className="rounded-xl bg-panel-2 border border-line p-3 text-xs">
      <div className="mb-2 flex items-center gap-1.5 text-muted">
        <Download size={13} className="text-accent-2" />
        {t.sidebar.downloading}
      </div>
      <div className="space-y-2.5">
        {active.map((m) => {
          const total = m.total || m.bytes
          const received = m.received ?? 0
          return (
            <div key={m.key}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-fg">{modelName(m.key, catalog)}</span>
                <button
                  title={t.common.cancel}
                  onClick={() => void window.qts.models.cancel(m.key)}
                  className="shrink-0 rounded p-0.5 text-faint hover:bg-line hover:text-fg cursor-pointer"
                >
                  <X size={12} />
                </button>
              </div>
              <Progress className="mt-1.5" value={received / Math.max(1, total)} />
              <div className="mt-1 flex justify-between font-mono text-[10px] text-faint">
                <span>{Math.floor((received / Math.max(1, total)) * 100)}%</span>
                <span>{m.speed ? `${bytes(m.speed)}/с` : bytes(total)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Loaded() {
  const stats = useApp((s) => s.stats)
  const status = useApp((s) => s.status)
  const asr = useApp((s) => s.asr)
  const catalog = useApp((s) => s.catalog)
  const backend = useApp((s) => s.backend.state)
  const gpu = useApp((s) => s.gpu)
  const unloadModel = useApp((s) => s.unloadModel)
  const [unloading, setUnloading] = useState(false)
  if (backend !== 'ready' || !stats?.cuda) return null

  const used = stats.vram_used ?? 0
  const total = stats.vram_total ?? 1
  const tts = status?.model_id && status.state !== 'idle' ? status : null

  const unload = async (): Promise<void> => {
    setUnloading(true)
    await unloadModel()
    setUnloading(false)
  }

  return (
    <div className="rounded-xl bg-panel-2 border border-line p-3 text-xs">
      <div className="truncate text-muted" title={stats.gpu}>{stats.gpu ?? gpu?.name}</div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-accent" style={{ width: `${(used / total) * 100}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-faint">
        <span>VRAM</span>
        <span className="font-mono">
          {gib(used)} / {(total / 2 ** 30).toFixed(1)}
        </span>
      </div>
      <div className="mt-3 mb-1 text-[10px] uppercase tracking-wider text-faint">{t.sidebar.inMemory}</div>
      {!tts && !asr && <div className="text-faint">{t.sidebar.nothingLoaded}</div>}
      {tts && (
        <div className="flex items-center gap-1.5">
          <span
            className={cx(
              'h-2 w-2 shrink-0 rounded-full',
              tts.state === 'ready' ? 'bg-ok' : tts.state === 'loading' ? 'bg-warn animate-pulse' : 'bg-bad'
            )}
          />
          <span className="min-w-0 flex-1 truncate text-fg" title={tts.error ?? undefined}>
            {modelName(tts.model_id!, catalog)}
            {tts.state === 'loading' && <span className="text-faint"> · {t.sidebar.loading}</span>}
          </span>
          {unloading ? (
            <Spinner size={12} />
          ) : (
            <button
              title={tts.busy ? t.sidebar.busy : t.sidebar.unload}
              disabled={tts.busy || tts.state === 'loading'}
              onClick={() => void unload()}
              className="shrink-0 rounded p-0.5 text-faint hover:bg-line hover:text-fg cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
            >
              <X size={12} />
            </button>
          )}
        </div>
      )}
      {asr && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-warn animate-pulse" />
          <span className="min-w-0 flex-1 truncate text-fg">
            {modelName(`whisper-${asr}`, catalog)}
            <span className="text-faint"> · {t.sidebar.transcribing}</span>
          </span>
        </div>
      )}
    </div>
  )
}

export function SidebarStatus() {
  return (
    <div className="flex flex-col gap-2">
      <Downloads />
      <Loaded />
    </div>
  )
}
