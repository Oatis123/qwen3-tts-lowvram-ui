import { Sparkles } from 'lucide-react'
import { useEffect } from 'react'
import { CHANGELOG, compareVersions, releasesBetween } from '../changelog'
import { fmt, t } from '../i18n'
import { useApp } from '../store'
import { Button, Modal } from './ui'

export function WhatsNew() {
  const mode = useApp((s) => s.whatsNew)
  const version = useApp((s) => s.info?.version ?? '')
  const seen = useApp((s) => s.settings.lastSeenVersion)
  const patch = useApp((s) => s.patch)
  const releases = mode === 'all' ? CHANGELOG.filter((r) => compareVersions(r.version, version) <= 0) : mode === 'auto' ? releasesBetween(seen, version) : []

  const close = (): void => {
    useApp.setState({ whatsNew: null })
    if (seen !== version) void patch({ lastSeenVersion: version })
  }

  useEffect(() => {
    if (mode === 'auto' && !releases.length) close()
  })

  return (
    <Modal
      open={!!mode && releases.length > 0}
      onClose={close}
      width="max-w-xl"
      title={
        <span className="flex items-center gap-2">
          <Sparkles size={18} className="text-accent-2" />
          {mode === 'auto' ? fmt(t.whatsNew.updated, { v: version }) : t.whatsNew.title}
        </span>
      }
      footer={
        <Button variant="primary" onClick={close}>
          {t.whatsNew.ok}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        {releases.map((r) => (
          <div key={r.version}>
            {(mode === 'all' || releases.length > 1) && <div className="mb-2 text-[13px] font-semibold text-muted">{fmt(t.whatsNew.version, { v: r.version })}</div>}
            <ul className="flex flex-col gap-2">
              {r.items.map((item, i) => (
                <li key={i} className="flex gap-2.5 text-[14px] leading-relaxed">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  )
}
