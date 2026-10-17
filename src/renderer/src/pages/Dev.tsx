import { Bug, Copy, RotateCw, Upload, Zap } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { LoadOptions } from '../../../shared/types'
import { Badge, Button, Card, NumberInput, PageHeader, Row, Select, Toggle } from '../components/ui'
import { t } from '../i18n'
import { api, type Stats } from '../lib/api'
import { gib } from '../lib/format'
import { modelKey, useApp, useGen } from '../store'

const WINDOW = 120

function VramChart({ series, total }: { series: { used: number; reserved: number }[]; total: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const w = c.clientWidth
    const h = c.clientHeight
    const dpr = window.devicePixelRatio || 1
    c.width = w * dpr
    c.height = h * dpr
    const ctx = c.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)
    const css = getComputedStyle(document.documentElement)
    ctx.strokeStyle = css.getPropertyValue('--color-line')
    ctx.lineWidth = 1
    for (let g = 1; g < 4; g++) {
      const y = (h * g) / 4
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }
    const line = (key: 'used' | 'reserved', color: string, fill: boolean): void => {
      if (!series.length) return
      ctx.beginPath()
      series.forEach((p, i) => {
        const x = (i / (WINDOW - 1)) * w + (w - ((series.length - 1) / (WINDOW - 1)) * w)
        const y = h - (p[key] / total) * h
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.stroke()
      if (fill) {
        ctx.lineTo(w, h)
        ctx.lineTo(w - ((series.length - 1) / (WINDOW - 1)) * w, h)
        ctx.closePath()
        ctx.fillStyle = color + '22'
        ctx.fill()
      }
    }
    line('used', css.getPropertyValue('--color-accent').trim(), true)
    line('reserved', css.getPropertyValue('--color-ok').trim(), false)
  }, [series, total])
  return <canvas ref={ref} className="h-40 w-full" />
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-panel-2 border border-line p-3">
      <div className="text-[11px] uppercase tracking-wider text-faint">{label}</div>
      <div className={`mt-1 font-mono text-[15px] ${tone ?? ''}`}>{value}</div>
    </div>
  )
}

export default function Dev() {
  const settings = useApp((s) => s.settings)
  const status = useApp((s) => s.status)
  const patch = useApp((s) => s.patch)
  const toast = useApp((s) => s.toast)
  const genStats = useGen((s) => s.stats)
  const [stats, setStats] = useState<Stats | null>(null)
  const [series, setSeries] = useState<{ used: number; reserved: number }[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const [follow, setFollow] = useState(true)
  const [busy, setBusy] = useState(false)
  const logRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    const tick = (): void => {
      void api
        .stats()
        .then((s) => {
          setStats(s)
          setSeries((prev) => [...prev.slice(-(WINDOW - 1)), { used: s.vram_used ?? 0, reserved: s.torch_reserved ?? 0 }])
        })
        .catch(() => {})
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    void window.qts.backend.logs().then(setLogs)
    return window.qts.backend.onLog((line) => setLogs((l) => [...l.slice(-2000), line]))
  }, [])

  useEffect(() => {
    if (follow) logRef.current?.scrollTo(0, logRef.current.scrollHeight)
  }, [logs, follow])

  const load = settings.load
  const setLoad = (p: Partial<LoadOptions>): void => void patch({ load: { ...load, ...p } })
  const key = modelKey(settings.mode, settings.size)

  const reload = async (): Promise<void> => {
    setBusy(true)
    try {
      await api.loadModel(status?.model_id ?? key, load)
      toast('Модель перезагружена', 'ok')
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
      void useApp.getState().refreshStatus()
    }
  }

  const total = stats?.vram_total ?? 1

  return (
    <div className="mx-auto max-w-5xl px-8 py-7">
      <PageHeader
        title={t.dev.title}
        actions={
          <>
            <Button size="sm" icon={<Bug size={14} />} onClick={() => void window.qts.app.devtools()}>
              {t.dev.devtools}
            </Button>
            <Button size="sm" icon={<RotateCw size={14} />} onClick={() => void window.qts.backend.restart()}>
              {t.dev.restart}
            </Button>
          </>
        }
      />

      <Card className="mb-4 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[15px] font-semibold">{t.dev.vram}</div>
          <div className="flex items-center gap-3 text-xs text-faint">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" />{t.dev.gpuTotal}</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-ok" />{t.dev.torchReserved}</span>
          </div>
        </div>
        <VramChart series={series} total={total} />
        <div className="mt-4 grid grid-cols-4 gap-3">
          <Metric label={t.dev.gpuTotal} value={`${gib(stats?.vram_used)} / ${(total / 2 ** 30).toFixed(1)}`} />
          <Metric label={t.dev.torchAlloc} value={gib(stats?.torch_allocated)} />
          <Metric label={t.dev.torchReserved} value={gib(stats?.torch_reserved)} />
          <Metric label={t.dev.peak} value={gib(stats?.torch_peak)} />
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[15px] font-semibold">{t.dev.model}</div>
            <Badge tone={status?.state === 'ready' ? 'ok' : status?.state === 'loading' ? 'warn' : status?.state === 'error' ? 'bad' : 'muted'}>{status?.state ?? '—'}</Badge>
          </div>
          <div className="font-mono text-[13px] text-muted">{status?.model_id ?? '—'}</div>
          {status?.error && <div className="mt-2 text-xs text-bad">{status.error}</div>}
          <div className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-faint">{t.dev.loadOptions}</div>
          <Row label="max_seq_len" hint="Размер статического KV-кеша">
            <NumberInput value={load.max_seq_len} min={256} max={8192} step={128} onChange={(v) => setLoad({ max_seq_len: v ?? 2048 })} />
          </Row>
          <Row label="offload_text_embedding" hint="−594 MiB: текстовый эмбеддинг в RAM">
            <Toggle checked={load.offload_embedding} onChange={(v) => setLoad({ offload_embedding: v })} />
          </Row>
          <Row label="repack_weights" hint="Плотная переупаковка весов">
            <Toggle checked={load.repack} onChange={(v) => setLoad({ repack: v })} />
          </Row>
          <Row label="attn_implementation">
            <Select value={load.attn} onChange={(v) => setLoad({ attn: v as LoadOptions['attn'] })} options={[{ value: 'sdpa', label: 'sdpa' }, { value: 'eager', label: 'eager' }]} />
          </Row>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="primary" icon={<Zap size={14} />} loading={busy} onClick={() => void reload()}>
              {t.dev.reload}
            </Button>
            <Button size="sm" icon={<Upload size={14} />} onClick={() => void api.unloadModel().then(() => useApp.getState().refreshStatus())}>
              {t.dev.unload}
            </Button>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-3 text-[15px] font-semibold">{t.dev.lastGen}</div>
          {genStats ? (
            <div className="grid grid-cols-2 gap-3">
              <Metric label={t.dev.firstChunk} value={`${genStats.first_chunk_ms} ms`} />
              <Metric label={t.dev.rtf} value={genStats.rtf?.toFixed(3) ?? '—'} tone={genStats.rtf && genStats.rtf < 1 ? 'text-ok' : 'text-warn'} />
              <Metric label={t.dev.audio} value={`${genStats.audio_seconds.toFixed(2)} s`} />
              <Metric label={t.dev.genTime} value={`${genStats.gen_seconds.toFixed(2)} s`} />
              <Metric label={t.dev.peak} value={gib(genStats.peak_vram)} />
            </div>
          ) : (
            <div className="text-[13px] text-faint">—</div>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[15px] font-semibold">{t.dev.logs}</div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted">
              <Toggle checked={follow} onChange={setFollow} /> auto-scroll
            </label>
            <Button size="sm" variant="ghost" icon={<Copy size={14} />} onClick={() => void navigator.clipboard.writeText(logs.join('\n')).then(() => toast(t.common.copied, 'ok'))}>
              {t.common.copy}
            </Button>
          </div>
        </div>
        <pre ref={logRef} data-selectable className="h-80 overflow-auto rounded-lg bg-bg border border-line p-3 font-mono text-[11px] leading-relaxed text-muted whitespace-pre-wrap">
          {logs.join('\n')}
        </pre>
      </Card>
    </div>
  )
}
