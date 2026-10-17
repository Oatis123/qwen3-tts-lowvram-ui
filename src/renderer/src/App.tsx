import { Activity, AlertTriangle, AudioLines, Boxes, Clock, Library, RotateCw, Settings as SettingsIcon } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { SidebarStatus } from './components/SidebarStatus'
import { Button, cx, Spinner } from './components/ui'
import { WhatsNew } from './components/WhatsNew'
import { t } from './i18n'
import { api } from './lib/api'
import Dev from './pages/Dev'
import Generate from './pages/Generate'
import History from './pages/History'
import Models from './pages/Models'
import SettingsPage from './pages/Settings'
import Setup from './pages/Setup'
import Voices from './pages/Voices'
import { useApp, type Page } from './store'

function NavItem({ page, icon, label }: { page: Page; icon: ReactNode; label: string }) {
  const current = useApp((s) => s.page)
  const go = useApp((s) => s.go)
  return (
    <button
      onClick={() => go(page)}
      className={cx(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[14px] transition-colors cursor-pointer',
        current === page ? 'bg-accent/15 text-fg' : 'text-muted hover:bg-panel-2 hover:text-fg'
      )}
    >
      <span className={current === page ? 'text-accent-2' : ''}>{icon}</span>
      {label}
    </button>
  )
}

function BackendGate({ children }: { children: ReactNode }) {
  const backend = useApp((s) => s.backend)
  const start = useApp((s) => s.startBackend)
  if (backend.state === 'ready') return <>{children}</>
  if (backend.state === 'error' || backend.state === 'stopped') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-10 text-center">
        <AlertTriangle className="text-bad" size={36} />
        <div className="text-lg font-semibold">{t.setup.backendFailed}</div>
        {backend.error && (
          <pre data-selectable className="max-h-64 max-w-3xl overflow-auto rounded-xl bg-panel-2 border border-line p-4 text-left text-xs text-muted whitespace-pre-wrap">
            {backend.error}
          </pre>
        )}
        <div className="flex gap-2">
          <Button variant="primary" icon={<RotateCw size={16} />} onClick={() => void window.qts.backend.restart().then(() => start())}>
            {t.errors.restart}
          </Button>
          <Button onClick={() => useApp.setState({ needsSetup: true })}>{t.settings.reinstall}</Button>
        </div>
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted">
      <Spinner size={28} />
      <div>{t.setup.starting}</div>
    </div>
  )
}

function Toasts() {
  const toasts = useApp((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex flex-col gap-2">
      {toasts.map((x) => (
        <div
          key={x.id}
          className={cx(
            'pointer-events-auto max-w-sm rounded-xl border px-4 py-3 text-[13px] shadow-xl',
            x.kind === 'error' ? 'border-bad/40 bg-[#2a1720] text-fg' : x.kind === 'ok' ? 'border-ok/40 bg-[#132620] text-fg' : 'border-line bg-panel-2 text-fg'
          )}
        >
          {x.text}
        </div>
      ))}
    </div>
  )
}

export default function App() {
  const booted = useApp((s) => s.booted)
  const needsSetup = useApp((s) => s.needsSetup)
  const page = useApp((s) => s.page)
  const devMode = useApp((s) => s.settings?.devMode)
  const backendState = useApp((s) => s.backend.state)
  const boot = useApp((s) => s.boot)

  useEffect(() => {
    void boot()
    void window.qts.gpu.check().then((gpu) => useApp.setState({ gpu }))
  }, [boot])

  useEffect(() => {
    if (backendState !== 'ready') return
    const tick = (): void => {
      void api.stats().then((stats) => useApp.setState({ stats })).catch(() => {})
      void useApp.getState().refreshStatus()
    }
    tick()
    const id = setInterval(tick, 2500)
    return () => clearInterval(id)
  }, [backendState])

  useEffect(() => {
    if (!devMode && page === 'dev') useApp.getState().go('generate')
  }, [devMode, page])

  if (!booted) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={28} />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="drag flex h-10 shrink-0 items-center gap-2 border-b border-line bg-panel px-4">
        <AudioLines size={18} className="text-accent" />
        <span className="text-[13px] font-semibold">{t.app.name}</span>
      </div>
      {needsSetup ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Setup />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-56 shrink-0 flex-col gap-1 border-r border-line bg-panel p-3">
            <NavItem page="generate" icon={<AudioLines size={18} />} label={t.nav.generate} />
            <NavItem page="voices" icon={<Library size={18} />} label={t.nav.voices} />
            <NavItem page="history" icon={<Clock size={18} />} label={t.nav.history} />
            <NavItem page="models" icon={<Boxes size={18} />} label={t.nav.models} />
            {devMode && <NavItem page="dev" icon={<Activity size={18} />} label={t.nav.dev} />}
            <NavItem page="settings" icon={<SettingsIcon size={18} />} label={t.nav.settings} />
            <div className="flex-1" />
            <SidebarStatus />
          </aside>
          <main className="min-w-0 flex-1 overflow-y-auto">
            {page === 'settings' ? (
              <SettingsPage />
            ) : page === 'models' ? (
              <Models />
            ) : (
              <BackendGate>
                {page === 'generate' && <Generate />}
                {page === 'voices' && <Voices />}
                {page === 'history' && <History />}
                {page === 'dev' && <Dev />}
              </BackendGate>
            )}
          </main>
        </div>
      )}
      {!needsSetup && <WhatsNew />}
      <Toasts />
    </div>
  )
}
