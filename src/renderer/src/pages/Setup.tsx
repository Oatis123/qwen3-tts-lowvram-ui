import { AlertTriangle, Check, CheckCircle2, Cpu, Download, ExternalLink, Package, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { RuntimeProgress } from '../../../shared/types'
import { Button, Card, cx, Progress, Spinner } from '../components/ui'
import { t } from '../i18n'
import { bytes } from '../lib/format'
import { useApp } from '../store'

type Step = 'gpu' | 'runtime' | 'model'
const STAGES = ['python', 'venv', 'packages', 'verify'] as const

function Steps({ step }: { step: Step }) {
  const items: [Step, string][] = [
    ['gpu', t.setup.stepGpu],
    ['runtime', t.setup.stepRuntime],
    ['model', t.setup.stepModel]
  ]
  const idx = items.findIndex(([s]) => s === step)
  return (
    <div className="flex items-center gap-3 mb-8">
      {items.map(([s, label], i) => (
        <div key={s} className="flex items-center gap-3">
          <div className={cx('flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold', i < idx ? 'bg-ok text-black' : i === idx ? 'bg-accent text-white' : 'bg-line text-muted')}>
            {i < idx ? <Check size={14} /> : i + 1}
          </div>
          <span className={cx('text-[13px]', i === idx ? 'text-fg' : 'text-muted')}>{label}</span>
          {i < items.length - 1 && <div className="h-px w-10 bg-line" />}
        </div>
      ))}
    </div>
  )
}

function GpuStep({ onNext }: { onNext: () => void }) {
  const gpu = useApp((s) => s.gpu)
  const [checking, setChecking] = useState(false)
  const recheck = async (): Promise<void> => {
    setChecking(true)
    useApp.setState({ gpu: await window.qts.gpu.check() })
    setChecking(false)
  }
  if (!gpu) return <Spinner size={24} />
  const driverLink = (
    <Button variant="ghost" size="sm" icon={<ExternalLink size={14} />} onClick={() => void window.qts.shell.openExternal('https://www.nvidia.com/Download/index.aspx')}>
      {t.setup.driverLink}
    </Button>
  )
  return (
    <div>
      <h2 className="text-2xl font-semibold">{t.setup.welcome}</h2>
      <p className="mt-2 text-muted">{t.setup.welcomeText}</p>
      <Card className="mt-6 p-5">
        {gpu.ok ? (
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-ok/15 text-ok">
              <Cpu size={22} />
            </div>
            <div className="flex-1">
              <div className="font-semibold">{t.setup.gpuOk}</div>
              <div className="text-[13px] text-muted mt-0.5">
                {gpu.name} · {((gpu.vramMb ?? 0) / 1024).toFixed(0)} {t.common.gb} {t.setup.vram} · драйвер {gpu.driver}
              </div>
              {!gpu.driverOk && (
                <div className="mt-3 rounded-lg bg-warn/10 border border-warn/30 p-3 text-[13px]">
                  <div className="font-medium text-warn">{t.setup.driverOld}</div>
                  <div className="text-muted mt-1">{t.setup.driverOldText}</div>
                  <div className="mt-2">{driverLink}</div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-bad/15 text-bad">
              <AlertTriangle size={22} />
            </div>
            <div className="flex-1">
              <div className="font-semibold">{t.setup.gpuNone}</div>
              <div className="text-[13px] text-muted mt-1">{t.setup.gpuNoneText}</div>
              <div className="mt-2">{driverLink}</div>
            </div>
          </div>
        )}
      </Card>
      <div className="mt-6 flex gap-2">
        {gpu.ok ? (
          <Button variant="primary" size="lg" onClick={onNext}>
            {t.common.next}
          </Button>
        ) : (
          <>
            <Button variant="primary" size="lg" loading={checking} onClick={() => void recheck()}>
              {t.setup.checkAgain}
            </Button>
            <Button variant="ghost" size="lg" onClick={onNext}>
              {t.setup.continueAnyway}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

function RuntimeStep({ onNext }: { onNext: () => void }) {
  const runtime = useApp((s) => s.runtime)
  const info = useApp((s) => s.info)
  const isUpdate = !!runtime?.installed && !runtime.upToDate
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<RuntimeProgress | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [showLog, setShowLog] = useState(false)
  const [started, setStarted] = useState<number | null>(null)
  const [, setNow] = useState(0)
  const logRef = useRef<HTMLPreElement>(null)

  useEffect(
    () =>
      window.qts.runtime.onProgress((p) => {
        if (p.stage !== 'error' && p.stage !== 'done') setProgress(p)
        if (p.line) setLog((l) => [...l.slice(-400), p.line!])
      }),
    []
  )
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [running])
  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight)
  }, [log, showLog])

  const install = async (): Promise<void> => {
    setRunning(true)
    setFailed(null)
    setLog([])
    setStarted(Date.now())
    const ok = await window.qts.runtime.install()
    setRunning(false)
    if (ok) {
      useApp.setState({ runtime: await window.qts.runtime.status() })
      onNext()
    } else {
      setFailed(log.at(-1) ?? t.common.error)
      setShowLog(true)
    }
  }

  const stageIdx = progress ? STAGES.indexOf(progress.stage as (typeof STAGES)[number]) : -1
  const elapsed = started ? Math.floor((Date.now() - started) / 1000) : 0

  return (
    <div>
      <h2 className="text-2xl font-semibold">{isUpdate ? t.setup.runtimeUpdate : t.setup.runtimeTitle}</h2>
      <p className="mt-2 text-muted">{isUpdate ? t.setup.runtimeUpdateText : t.setup.runtimeText}</p>
      {info && (
        <div className={cx('mt-4 rounded-lg border p-3 text-[13px]', info.homeFallback ? 'border-warn/30 bg-warn/10' : 'border-line bg-panel')}>
          <div className={info.homeFallback ? 'text-warn' : 'text-muted'}>{info.homeFallback ? t.setup.fallbackPath : t.setup.installPath}</div>
          <div data-selectable className="mt-1 font-mono text-xs">{info.home}</div>
        </div>
      )}
      <Card className="mt-6 p-5">
        <div className="flex flex-col gap-3">
          {STAGES.map((s, i) => {
            const state = !running && !failed && stageIdx === -1 ? 'wait' : i < stageIdx ? 'done' : i === stageIdx ? (failed ? 'fail' : 'active') : 'wait'
            return (
              <div key={s} className="flex items-center gap-3">
                <div className="flex h-6 w-6 items-center justify-center">
                  {state === 'done' ? <CheckCircle2 size={20} className="text-ok" /> : state === 'active' ? <Spinner size={18} /> : state === 'fail' ? <X size={18} className="text-bad" /> : <div className="h-2 w-2 rounded-full bg-line-2" />}
                </div>
                <span className={state === 'wait' ? 'text-faint' : ''}>{t.setup.stages[s]}</span>
              </div>
            )
          })}
        </div>
        {running && (
          <div className="mt-5">
            <Progress indeterminate />
            <div className="mt-2 flex justify-between text-xs text-faint">
              <span className="truncate pr-4 font-mono">{progress?.line ?? '…'}</span>
              <span className="font-mono shrink-0">
                {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
              </span>
            </div>
          </div>
        )}
        {failed && <div className="mt-4 rounded-lg bg-bad/10 border border-bad/30 p-3 text-[13px] text-bad">{t.setup.installFailed}</div>}
        {(log.length > 0 || failed) && (
          <div className="mt-3">
            <button className="text-xs text-muted hover:text-fg cursor-pointer" onClick={() => setShowLog(!showLog)}>
              {t.setup.showLog} {showLog ? '▴' : '▾'}
            </button>
            {showLog && (
              <pre ref={logRef} data-selectable className="mt-2 max-h-56 overflow-auto rounded-lg bg-bg border border-line p-3 text-[11px] text-muted font-mono whitespace-pre-wrap">
                {log.join('\n')}
              </pre>
            )}
          </div>
        )}
      </Card>
      <div className="mt-6 flex gap-2">
        {running ? (
          <Button size="lg" onClick={() => void window.qts.runtime.cancel()}>
            {t.common.cancel}
          </Button>
        ) : (
          <Button variant="primary" size="lg" icon={<Package size={18} />} onClick={() => void install()}>
            {failed ? t.common.retry : isUpdate ? t.setup.update : t.setup.install}
          </Button>
        )}
      </div>
    </div>
  )
}

function WhisperStep() {
  const models = useApp((s) => s.models)
  const whisperModel = useApp((s) => s.settings.whisperModel)
  const downloadModel = useApp((s) => s.downloadModel)
  const finishSetup = useApp((s) => s.finishSetup)
  const [finishing, setFinishing] = useState(false)
  const key = `whisper-${whisperModel}`
  const m = models.find((x) => x.key === key)

  useEffect(() => {
    if (m && !m.downloaded && !m.downloading && !m.error) void downloadModel(key)
  }, [m, key, downloadModel])

  const start = async (): Promise<void> => {
    setFinishing(true)
    await finishSetup()
  }

  return (
    <div>
      <h2 className="text-2xl font-semibold">{t.setup.whisperTitle}</h2>
      <p className="mt-2 text-muted">{t.setup.whisperText}</p>
      {m && (
        <Card className="mt-6 p-5">
          <div className="flex items-start gap-4">
            <div className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', m.downloaded ? 'bg-ok/15 text-ok' : 'bg-accent/15 text-accent-2')}>
              {m.downloaded ? <CheckCircle2 size={22} /> : <Download size={22} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">Whisper {whisperModel}</div>
              <div className="text-[13px] text-muted mt-0.5">{m.repo} · {bytes(m.bytes)}</div>
              <div className="mt-3">
                {m.downloaded ? (
                  <span className="text-[13px] text-ok">{t.common.downloaded}</span>
                ) : m.downloading ? (
                  <>
                    <Progress value={(m.received ?? 0) / Math.max(1, m.total || m.bytes)} />
                    <div className="mt-1.5 flex justify-between font-mono text-xs text-faint">
                      <span>
                        {bytes(m.received)} / {bytes(m.total || m.bytes)}
                      </span>
                      <span>{m.speed ? `${bytes(m.speed)}/с` : ''}</span>
                    </div>
                  </>
                ) : m.error ? (
                  <div className="flex items-center gap-3">
                    <span className="text-[13px] text-bad">{m.error}</span>
                    <Button size="sm" onClick={() => void downloadModel(key)}>
                      {t.common.retry}
                    </Button>
                  </div>
                ) : (
                  <Progress indeterminate />
                )}
              </div>
            </div>
          </div>
        </Card>
      )}
      <p className="mt-4 text-[13px] text-faint">{t.setup.ttsLater}</p>
      <div className="mt-6">
        <Button variant="primary" size="lg" disabled={!m?.downloaded || finishing} loading={finishing} onClick={() => void start()}>
          {t.setup.start}
        </Button>
      </div>
    </div>
  )
}

export default function Setup() {
  const runtime = useApp((s) => s.runtime)
  const models = useApp((s) => s.models)
  const whisperModel = useApp((s) => s.settings.whisperModel)
  const finishSetup = useApp((s) => s.finishSetup)
  const whisperReady = !!models.find((m) => m.key === `whisper-${whisperModel}`)?.downloaded
  const [step, setStep] = useState<Step>(runtime?.upToDate ? 'model' : runtime?.installed ? 'runtime' : 'gpu')

  const afterRuntime = (): void => {
    if (whisperReady) void finishSetup()
    else setStep('model')
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <Steps step={step} />
      {step === 'gpu' && <GpuStep onNext={() => setStep('runtime')} />}
      {step === 'runtime' && <RuntimeStep onNext={afterRuntime} />}
      {step === 'model' && <WhisperStep />}
    </div>
  )
}
