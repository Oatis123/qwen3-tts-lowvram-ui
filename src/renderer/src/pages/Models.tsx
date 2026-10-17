import { CheckCircle2, Download, FolderOpen, Power, PowerOff, Trash2, X } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ModelEntryState } from '../../../shared/types'
import { Badge, Button, Card, IconButton, PageHeader, Progress, Spinner } from '../components/ui'
import { t } from '../i18n'
import { bytes } from '../lib/format'
import { useApp } from '../store'

function ModelRow({ m, title, hint }: { m: ModelEntryState; title: ReactNode; hint?: string }) {
  const downloadModel = useApp((s) => s.downloadModel)
  const refreshModels = useApp((s) => s.refreshModels)
  const status = useApp((s) => s.status)
  const whisperModel = useApp((s) => s.settings.whisperModel)
  const backendReady = useApp((s) => s.backend.state === 'ready')
  const loadModel = useApp((s) => s.loadModel)
  const unloadModel = useApp((s) => s.unloadModel)
  const loaded = status?.model_id === m.key
  const required = m.key === `whisper-${whisperModel}`

  const remove = async (): Promise<void> => {
    if (!confirm(t.models.deleteConfirm)) return
    await window.qts.models.remove(m.key)
    await refreshModels()
  }

  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{title}</span>
          {m.downloaded && <CheckCircle2 size={15} className="text-ok" />}
          {loaded && <Badge tone="accent">{t.models.loaded}</Badge>}
          {required && <Badge>{t.models.required}</Badge>}
        </div>
        <div className="mt-0.5 text-xs text-faint">
          {m.repo} · {bytes(m.bytes)}
          {hint && ` · ${hint}`}
        </div>
        {m.downloading && (
          <div className="mt-2 max-w-md">
            <Progress value={(m.received ?? 0) / Math.max(1, m.total ?? m.bytes)} />
            <div className="mt-1 font-mono text-[11px] text-faint">
              {bytes(m.received)} / {bytes(m.total || m.bytes)} · {bytes(m.speed)}
              {t.models.speed}
            </div>
          </div>
        )}
        {m.error && !m.downloading && <div className="mt-1 text-xs text-bad">{m.error}</div>}
      </div>
      {m.downloading ? (
        <IconButton title={t.common.cancel} onClick={() => void window.qts.models.cancel(m.key)}>
          <X size={16} />
        </IconButton>
      ) : m.downloaded ? (
        <div className="flex items-center gap-1">
          {!m.key.startsWith('whisper-') && backendReady &&
            (loaded && status?.state === 'ready' ? (
              <Button size="sm" variant="ghost" icon={<PowerOff size={14} />} disabled={status.busy} onClick={() => void unloadModel()}>
                {t.modelBar.unload}
              </Button>
            ) : loaded && status?.state === 'loading' ? (
              <span className="flex items-center gap-2 px-3 text-xs text-faint">
                <Spinner size={14} /> {t.sidebar.loading}
              </span>
            ) : (
              <Button size="sm" icon={<Power size={14} />} disabled={status?.state === 'loading' || !!status?.busy} onClick={() => void loadModel(m.key)}>
                {t.modelBar.load}
              </Button>
            ))}
          <IconButton title={required ? t.models.requiredHint : t.common.delete} disabled={loaded || required} onClick={() => void remove()}>
            <Trash2 size={16} />
          </IconButton>
        </div>
      ) : (
        <Button size="sm" icon={<Download size={14} />} onClick={() => void downloadModel(m.key)}>
          {t.common.download}
        </Button>
      )}
    </div>
  )
}

export default function Models() {
  const models = useApp((s) => s.models)
  const catalog = useApp((s) => s.catalog)
  const info = useApp((s) => s.info)
  const byKey = (k: string): ModelEntryState | undefined => models.find((m) => m.key === k)

  return (
    <div className="mx-auto max-w-4xl px-8 py-7">
      <PageHeader title={t.models.title} subtitle={t.models.subtitle} />
      <div className="mb-2 text-[13px] font-medium text-muted">{t.models.tts}</div>
      <Card className="mb-6 divide-y divide-line">
        {catalog.tts.map((tm) => {
          const m = byKey(tm.id)
          if (!m) return null
          return (
            <ModelRow
              key={tm.id}
              m={m}
              title={
                <>
                  {t.modes[tm.mode]} · {t.sizes[tm.size]} <span className="text-faint font-normal">{tm.size}</span>
                </>
              }
              hint={t.sizes[`${tm.size}Hint` as '0.6BHint'].split(' · ')[1]}
            />
          )
        })}
      </Card>
      <div className="mb-2 text-[13px] font-medium text-muted">{t.models.asr}</div>
      <Card className="mb-6 divide-y divide-line">
        {catalog.whisper.map((w) => {
          const m = byKey(`whisper-${w.id}`)
          if (!m) return null
          return <ModelRow key={w.id} m={m} title={w.id} hint={t.models.whisperHint[w.id]} />
        })}
      </Card>
      {info && (
        <Card className="flex items-center gap-4 p-5">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] text-muted">{t.models.folder}</div>
            <div data-selectable className="mt-0.5 truncate font-mono text-xs">
              {info.modelsDir}
            </div>
          </div>
          <Button size="sm" icon={<FolderOpen size={14} />} onClick={() => void window.qts.shell.openPath(info.dataDir)}>
            {t.models.openFolder}
          </Button>
        </Card>
      )}
    </div>
  )
}
