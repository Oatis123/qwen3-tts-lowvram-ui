import { Cpu, Power, PowerOff } from 'lucide-react'
import { fmt, t } from '../i18n'
import { modelName } from '../lib/models'
import { useApp } from '../store'
import { Button, Card, cx, Spinner } from './ui'

export function ModelBar({ modelKey, busy }: { modelKey: string; busy: boolean }) {
  const status = useApp((s) => s.status)
  const catalog = useApp((s) => s.catalog)
  const loadModel = useApp((s) => s.loadModel)
  const unloadModel = useApp((s) => s.unloadModel)

  const name = modelName(modelKey, catalog)
  const current = status?.model_id && status.state !== 'idle' ? status.model_id : null
  const loadingThis = status?.state === 'loading' && current === modelKey
  const loadingOther = status?.state === 'loading' && current !== modelKey
  const ready = status?.state === 'ready' && current === modelKey
  const failed = status?.state === 'error' && current === modelKey
  const other = current && current !== modelKey && status?.state === 'ready' ? modelName(current, catalog) : null

  return (
    <Card className="flex items-center gap-3 px-4 py-3">
      <div
        className={cx(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          ready ? 'bg-ok/15 text-ok' : loadingThis ? 'bg-warn/15 text-warn' : failed ? 'bg-bad/15 text-bad' : 'bg-panel-2 text-faint'
        )}
      >
        {loadingThis ? <Spinner size={16} /> : <Cpu size={17} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium">{name}</div>
        <div className={cx('truncate text-xs', failed ? 'text-bad' : 'text-faint')}>
          {ready
            ? t.modelBar.ready
            : loadingThis
              ? t.modelBar.loading
              : failed
                ? status?.error || t.modelBar.failed
                : loadingOther
                  ? t.modelBar.otherLoading
                  : other
                    ? fmt(t.modelBar.replaces, { name: other })
                    : t.modelBar.notLoaded}
        </div>
      </div>
      {ready ? (
        <Button size="sm" variant="ghost" icon={<PowerOff size={14} />} disabled={busy} onClick={() => void unloadModel()}>
          {t.modelBar.unload}
        </Button>
      ) : (
        <Button size="sm" variant="primary" icon={<Power size={14} />} disabled={busy || !!status?.busy || status?.state === 'loading'} onClick={() => void loadModel(modelKey)}>
          {failed ? t.common.retry : t.modelBar.load}
        </Button>
      )}
    </Card>
  )
}
