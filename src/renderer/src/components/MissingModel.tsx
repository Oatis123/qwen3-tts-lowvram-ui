import { Download } from 'lucide-react'
import { t } from '../i18n'
import { bytes } from '../lib/format'
import { useApp } from '../store'
import { Button, Card, Progress } from './ui'

export function MissingModel({ modelId }: { modelId: string }) {
  const models = useApp((s) => s.models)
  const downloadModel = useApp((s) => s.downloadModel)
  const m = models.find((x) => x.key === modelId)
  if (!m) return null
  return (
    <Card className="flex items-center gap-4 border-warn/40 p-4">
      <Download size={20} className="shrink-0 text-warn" />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium">{t.generate.missingModel}</div>
        <div className="text-xs text-faint">
          {m.repo} · {bytes(m.bytes)}
        </div>
        {m.downloading && (
          <div className="mt-2">
            <Progress value={(m.received ?? 0) / Math.max(1, m.total ?? m.bytes)} />
            <div className="mt-1 font-mono text-[11px] text-faint">
              {bytes(m.received)} / {bytes(m.total || m.bytes)} · {bytes(m.speed)}/с
            </div>
          </div>
        )}
      </div>
      {!m.downloading && !m.downloaded && (
        <Button variant="primary" onClick={() => void downloadModel(modelId)}>
          {t.generate.missingDownload}
        </Button>
      )}
    </Card>
  )
}
