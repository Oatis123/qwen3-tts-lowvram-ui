import { ExternalLink, FolderOpen, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge, Button, Input, NumberInput, PageHeader, Row, Section, Select, Toggle } from '../components/ui'
import { fmt, t } from '../i18n'
import { api } from '../lib/api'
import { useApp } from '../store'

export default function SettingsPage() {
  const settings = useApp((s) => s.settings)
  const catalog = useApp((s) => s.catalog)
  const models = useApp((s) => s.models)
  const voices = useApp((s) => s.voices)
  const info = useApp((s) => s.info)
  const updater = useApp((s) => s.updater)
  const backend = useApp((s) => s.backend.state)
  const patch = useApp((s) => s.patch)
  const [compat, setCompat] = useState<{ running: boolean; host: string | null; port: number | null } | null>(null)
  const [hf, setHf] = useState(settings.hfEndpoint)
  const dev = settings.devMode

  useEffect(() => {
    if (backend !== 'ready') return
    const id = setInterval(() => void api.status().then((s) => setCompat(s.compat)).catch(() => {}), 1500)
    void api.status().then((s) => setCompat(s.compat)).catch(() => {})
    return () => clearInterval(id)
  }, [backend])

  const changeDataDir = async (): Promise<void> => {
    const dir = await window.qts.dialog.folder()
    if (!dir) return
    await patch({ dataDir: dir })
    const [newInfo, list] = await Promise.all([window.qts.app.info(), window.qts.models.list()])
    useApp.setState({ info: newInfo, models: list })
    await useApp.getState().startBackend()
  }

  const downloadedWhisper = catalog.whisper.filter((w) => models.find((m) => m.key === `whisper-${w.id}`)?.downloaded)
  const whisperOptions = (downloadedWhisper.length ? downloadedWhisper : catalog.whisper).map((w) => ({ value: w.id, label: w.id }))
  const updateText = fmt(t.settings.updateStates[updater.state] ?? '', { v: updater.version ?? '', p: Math.round(updater.percent ?? 0) })
  const a = settings.api
  const setApi = (p: Partial<typeof a>): void => void patch({ api: { ...a, ...p } })

  return (
    <div className="mx-auto max-w-3xl px-8 py-7">
      <PageHeader title={t.settings.title} />

      <Section title={t.settings.general}>
        <Row label={t.settings.defaultLanguage}>
          <Select value={settings.language} onChange={(l) => void patch({ language: l })} options={catalog.languages.map((l) => ({ value: l, label: t.languages[l] ?? l }))} />
        </Row>
        <Row label={t.settings.dataDir} hint={t.settings.dataDirHint}>
          <Button size="sm" icon={<FolderOpen size={14} />} onClick={() => info && void window.qts.shell.openPath(info.dataDir)}>
            {t.common.open}
          </Button>
          <Button size="sm" onClick={() => void changeDataDir()}>
            {t.models.change}
          </Button>
        </Row>
        {info && <div data-selectable className="-mt-1 mb-2 truncate font-mono text-xs text-faint">{info.dataDir}</div>}
        {info && (
          <Row label={t.settings.homeDir} hint={info.home}>
            <Button size="sm" icon={<FolderOpen size={14} />} onClick={() => void window.qts.shell.openPath(info.home)}>
              {t.common.open}
            </Button>
          </Row>
        )}
        <Row label={t.settings.devMode} hint={t.settings.devModeHint}>
          <Toggle checked={dev} onChange={(v) => void patch({ devMode: v })} />
        </Row>
      </Section>

      <Section title={t.settings.asr}>
        <Row label={t.settings.whisperModel}>
          <Select value={settings.whisperModel} onChange={(v) => void patch({ whisperModel: v })} options={whisperOptions} />
        </Row>
        {dev && (
          <>
            <Row label={t.settings.whisperDevice}>
              <Select value={settings.whisperDevice} onChange={(v) => void patch({ whisperDevice: v as 'cuda' | 'cpu' })} options={[{ value: 'cuda', label: 'CUDA (GPU)' }, { value: 'cpu', label: 'CPU' }]} />
            </Row>
            <Row label={t.settings.computeType}>
              <Select
                value={settings.whisperComputeType}
                onChange={(v) => void patch({ whisperComputeType: v })}
                options={['int8_float16', 'float16', 'bfloat16', 'int8', 'float32'].map((v) => ({ value: v, label: v }))}
              />
            </Row>
            <Row label={t.settings.beam}>
              <NumberInput value={settings.whisperBeam} min={1} max={10} onChange={(v) => void patch({ whisperBeam: v ?? 5 })} />
            </Row>
            <Row label={t.settings.vad}>
              <Toggle checked={settings.whisperVad} onChange={(v) => void patch({ whisperVad: v })} />
            </Row>
          </>
        )}
      </Section>

      {dev && (
        <Section title={t.settings.api} hint={t.settings.apiHint}>
          <Row label={t.settings.apiEnabled} hint={compat?.running ? fmt(t.settings.apiRunning, { url: `http://${compat.host}:${compat.port}` }) : undefined}>
            {compat?.running && <Badge tone="ok">online</Badge>}
            <Toggle checked={a.enabled} onChange={(v) => setApi({ enabled: v })} />
          </Row>
          <Row label={t.settings.apiHost} hint={a.host !== '127.0.0.1' ? t.settings.apiWarning : undefined}>
            <Select value={a.host} onChange={(v) => setApi({ host: v })} options={[{ value: '127.0.0.1', label: '127.0.0.1' }, { value: '0.0.0.0', label: '0.0.0.0' }]} />
          </Row>
          <Row label={t.settings.apiPort}>
            <NumberInput value={a.port} min={1024} max={65535} onChange={(v) => setApi({ port: v ?? 2027 })} />
          </Row>
          <Row label={t.settings.apiVoice}>
            <Select
              value={a.mode}
              onChange={(v) => setApi({ mode: v as typeof a.mode })}
              options={(['clone', 'custom', 'design'] as const).map((m) => ({ value: m, label: t.modes[m] }))}
            />
            {a.mode === 'clone' && (
              <Select value={a.voiceId ?? ''} onChange={(v) => setApi({ voiceId: v || null })} options={[{ value: '', label: '—' }, ...voices.map((v) => ({ value: v.id, label: v.name }))]} />
            )}
            {a.mode === 'custom' && (
              <Select value={a.speaker ?? ''} onChange={(v) => setApi({ speaker: v })} options={catalog.speakers.map((s) => ({ value: s.id, label: s.name }))} />
            )}
          </Row>
          {a.mode !== 'clone' && (
            <Row label={a.mode === 'design' ? t.generate.design : t.generate.style}>
              <Input className="w-72" value={a.instruct} onChange={(e) => setApi({ instruct: e.target.value })} />
            </Row>
          )}
          <Row label={t.generate.language}>
            <Select value={a.language} onChange={(v) => setApi({ language: v })} options={catalog.languages.map((l) => ({ value: l, label: t.languages[l] ?? l }))} />
          </Row>
        </Section>
      )}

      <Section title={t.settings.updates}>
        <Row label={t.settings.autoUpdate} hint={t.settings.autoUpdateHint}>
          <Toggle checked={settings.autoUpdate} onChange={(v) => void patch({ autoUpdate: v })} />
        </Row>
        <div className="flex items-center gap-2 pt-3">
          <Button size="sm" icon={<RefreshCw size={14} />} disabled={updater.state === 'disabled' || updater.state === 'checking'} onClick={() => void window.qts.updater.check()}>
            {t.settings.checkNow}
          </Button>
          {(updater.state === 'available' || updater.state === 'ready' || (updater.state === 'error' && !!updater.version)) && (
            <Button size="sm" variant="primary" onClick={() => void window.qts.updater.install()}>
              {t.settings.restartUpdate}
            </Button>
          )}
          <span className="text-xs text-faint">{updateText}</span>
        </div>
      </Section>

      {dev && (
        <Section title={t.settings.runtime}>
          <Row label={t.settings.hfEndpoint}>
            <Input className="w-72" value={hf} onChange={(e) => setHf(e.target.value)} onBlur={() => void patch({ hfEndpoint: hf.trim() || 'https://huggingface.co' })} />
          </Row>
          <Row label={t.settings.reinstall}>
            <Button size="sm" onClick={() => useApp.setState({ needsSetup: true, runtime: { installed: true, upToDate: false, venvPython: '' } })}>
              {t.settings.reinstall}
            </Button>
          </Row>
        </Section>
      )}

      <Section title={t.settings.about}>
        <Row label={t.settings.version}>
          <span className="font-mono text-[13px] text-muted">{info?.version}</span>
        </Row>
        <div className="flex flex-wrap gap-2 pt-3">
          <Button size="sm" variant="ghost" icon={<ExternalLink size={14} />} onClick={() => void window.qts.shell.openExternal('https://github.com/Oatis123/qwen3-tts-lowvram')}>
            qwen3-tts-lowvram
          </Button>
          <Button size="sm" variant="ghost" icon={<ExternalLink size={14} />} onClick={() => void window.qts.shell.openExternal('https://github.com/QwenLM/Qwen3-TTS')}>
            Qwen3-TTS
          </Button>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="danger"
            onClick={async () => {
              if (!confirm(t.settings.resetConfirm)) return
              useApp.setState({ settings: await window.qts.settings.reset() })
            }}
          >
            {t.settings.resetAll}
          </Button>
        </div>
      </Section>
    </div>
  )
}
