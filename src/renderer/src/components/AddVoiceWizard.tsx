import { Check, Download, FileAudio, Mic, Pause, Play, Sparkles, Square, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { fmt, t } from '../i18n'
import { api, type Voice } from '../lib/api'
import { decodeToMono, encodeWav, formatTime, sliceSec, SR, suggestRegion } from '../lib/audio'
import { bytes } from '../lib/format'
import { clipPlayer } from '../lib/player'
import { Recorder } from '../lib/recorder'
import { useApp } from '../store'
import { Button, cx, Input, Label, Modal, Progress, Select, Spinner, Textarea } from './ui'
import { useClipState } from './VoiceSelect'
import { RegionWave } from './Waveform'

type Step = 0 | 1 | 2

function StepDots({ step }: { step: Step }) {
  return (
    <div className="mb-5 flex items-center gap-2">
      {t.wizard.steps.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div className={cx('flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold', i < step ? 'bg-ok text-black' : i === step ? 'bg-accent text-white' : 'bg-line text-muted')}>
            {i < step ? <Check size={12} /> : i + 1}
          </div>
          <span className={cx('text-[13px]', i === step ? 'text-fg' : 'text-faint')}>{label}</span>
          {i < 2 && <div className="mx-1 h-px w-6 bg-line" />}
        </div>
      ))}
    </div>
  )
}

export function AddVoiceWizard({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (v: Voice) => void }) {
  const settings = useApp((s) => s.settings)
  const catalog = useApp((s) => s.catalog)
  const models = useApp((s) => s.models)
  const downloadModel = useApp((s) => s.downloadModel)
  const toast = useApp((s) => s.toast)
  const refreshVoices = useApp((s) => s.refreshVoices)

  const [step, setStep] = useState<Step>(0)
  const [samples, setSamples] = useState<Float32Array | null>(null)
  const [source, setSource] = useState<'file' | 'mic'>('file')
  const [fileName, setFileName] = useState('')
  const [region, setRegion] = useState<[number, number]>([0, 0])
  const [text, setText] = useState('')
  const [language, setLanguage] = useState(settings.language)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recTime, setRecTime] = useState(0)
  const [level, setLevel] = useState(0)
  const recorder = useRef<Recorder | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const clip = useClipState()
  const autoTried = useRef(false)

  const whisperKey = `whisper-${settings.whisperModel}`
  const whisper = models.find((m) => m.key === whisperKey)

  useEffect(() => {
    if (!open) return
    setStep(0)
    setSamples(null)
    setText('')
    setName('')
    setError(null)
    setLanguage(settings.language)
    autoTried.current = false
  }, [open, settings.language])

  useEffect(() => {
    if (!recording) return
    const started = Date.now()
    const id = setInterval(() => {
      setRecTime((Date.now() - started) / 1000)
      setLevel(recorder.current?.level() ?? 0)
    }, 80)
    return () => clearInterval(id)
  }, [recording])

  useEffect(() => () => recorder.current?.cancel(), [])

  const accept = (s: Float32Array, src: 'file' | 'mic', label: string): void => {
    if (s.length < SR * 1.5) {
      setError(t.wizard.tooShort)
      return
    }
    setSamples(s)
    setSource(src)
    setFileName(label)
    setRegion(suggestRegion(s))
    setError(null)
    setStep(1)
  }

  const loadFile = async (file: File): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const s = await decodeToMono(await file.arrayBuffer())
      accept(s, 'file', file.name)
      if (!name) setName(file.name.replace(/\.[^.]+$/, ''))
    } catch {
      setError(t.wizard.decodeError)
    } finally {
      setBusy(false)
    }
  }

  const toggleRecord = async (): Promise<void> => {
    if (recording) {
      setRecording(false)
      setBusy(true)
      try {
        const s = await recorder.current!.stop()
        accept(s, 'mic', t.wizard.record)
      } catch {
        setError(t.wizard.decodeError)
      } finally {
        setBusy(false)
      }
      return
    }
    try {
      recorder.current = new Recorder()
      await recorder.current.start()
      setRecTime(0)
      setRecording(true)
      setError(null)
    } catch {
      setError(t.wizard.micError)
    }
  }

  const regionSamples = (): Float32Array => (samples ? sliceSec(samples, region[0], region[1]) : new Float32Array(0))
  const regionLen = region[1] - region[0]

  const transcribe = async (): Promise<void> => {
    setTranscribing(true)
    setError(null)
    try {
      const r = await api.transcribe(encodeWav(regionSamples()), {
        model: settings.whisperModel,
        language: language === 'Auto' ? '' : language,
        device: settings.whisperDevice,
        compute_type: settings.whisperComputeType,
        beam_size: settings.whisperBeam,
        vad: settings.whisperVad
      })
      setText(r.text)
      if (r.language && r.language !== 'Auto' && catalog.languages.includes(r.language)) setLanguage(r.language)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setTranscribing(false)
    }
  }

  useEffect(() => {
    if (step === 2 && !text && whisper?.downloaded && !autoTried.current) {
      autoTried.current = true
      void transcribe()
    }
  })

  const save = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const v = await api.voices.create(encodeWav(regionSamples()), name.trim() || 'Голос', text.trim(), language, source)
      await refreshVoices()
      toast(fmt(t.voices.added, { name: v.name }), 'ok')
      onCreated?.(v)
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const lenTone = regionLen < 3 ? 'text-bad' : regionLen > 20 ? 'text-warn' : 'text-ok'
  const lenText = regionLen < 3 ? t.wizard.tooShort : regionLen > 20 ? t.wizard.tooLong : t.wizard.good

  const footer =
    step === 0 ? (
      <Button variant="ghost" onClick={onClose}>
        {t.common.cancel}
      </Button>
    ) : step === 1 ? (
      <>
        <Button variant="ghost" onClick={() => setStep(0)}>
          {t.common.back}
        </Button>
        <Button variant="primary" disabled={regionLen < 3} onClick={() => setStep(2)}>
          {t.common.next}
        </Button>
      </>
    ) : (
      <>
        <Button variant="ghost" onClick={() => setStep(1)}>
          {t.common.back}
        </Button>
        <Button variant="primary" loading={busy} disabled={!text.trim() || transcribing} icon={<Check size={16} />} onClick={() => void save()}>
          {t.wizard.create}
        </Button>
      </>
    )

  return (
    <Modal open={open} onClose={() => !recording && onClose()} title={t.wizard.title} width="max-w-2xl" footer={footer}>
      <StepDots step={step} />

      {step === 0 && (
        <div>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const f = e.dataTransfer.files[0]
              if (f) void loadFile(f)
            }}
            className={cx('flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors', dragOver ? 'border-accent bg-accent/10' : 'border-line-2')}
          >
            {busy ? (
              <Spinner size={28} />
            ) : recording ? (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-bad/20 text-bad">
                  <Mic size={26} />
                </div>
                <div className="mt-3 font-semibold">{t.wizard.recording}</div>
                <div className="mt-1 font-mono text-2xl">{formatTime(recTime)}</div>
                <div className="mt-3 h-2 w-56 overflow-hidden rounded-full bg-line">
                  <div className="h-full bg-ok transition-[width] duration-75" style={{ width: `${level * 100}%` }} />
                </div>
                <Button className="mt-5" variant="danger" icon={<Square size={14} fill="currentColor" />} onClick={() => void toggleRecord()}>
                  {t.wizard.stopRecording}
                </Button>
              </>
            ) : (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-panel-2 text-accent">
                  <FileAudio size={26} />
                </div>
                <div className="mt-3 font-semibold">{t.wizard.dropTitle}</div>
                <div className="mt-1 text-xs text-faint">{t.wizard.formats}</div>
                <div className="mt-5 flex items-center gap-3">
                  <Button variant="primary" icon={<Upload size={16} />} onClick={() => fileInput.current?.click()}>
                    {t.wizard.chooseFile}
                  </Button>
                  <span className="text-xs text-faint">{t.wizard.dropOr}</span>
                  <Button icon={<Mic size={16} />} onClick={() => void toggleRecord()}>
                    {t.wizard.record}
                  </Button>
                </div>
              </>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="audio/*,.wav,.mp3,.flac,.ogg,.m4a,.webm"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void loadFile(f)
                e.target.value = ''
              }}
            />
          </div>
          <ul className="mt-4 space-y-1.5 text-[13px] text-muted">
            {t.wizard.tips.map((tip) => (
              <li key={tip} className="flex items-center gap-2">
                <Check size={14} className="text-ok" /> {tip}
              </li>
            ))}
          </ul>
          <div className="mt-3 text-xs text-faint">{t.voices.consent}</div>
        </div>
      )}

      {step === 1 && samples && (
        <div>
          <Label hint={t.wizard.regionHint}>{t.wizard.regionTitle}</Label>
          <div className="rounded-xl bg-panel-2 border border-line p-3">
            <RegionWave samples={samples} region={region} onChange={setRegion} />
            <div className="mt-2 flex justify-between font-mono text-xs text-faint">
              <span>{formatTime(region[0])}</span>
              <span className="truncate px-3">{fileName}</span>
              <span>{formatTime(region[1])}</span>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <Button
              icon={clip === 'region' ? <Pause size={16} /> : <Play size={16} />}
              onClick={() => (clip === 'region' ? clipPlayer.stop() : clipPlayer.playSamples('region', regionSamples()))}
            >
              {t.wizard.playRegion}
            </Button>
            <div className={cx('text-[13px]', lenTone)}>
              {regionLen.toFixed(1)} {t.common.seconds} · {lenText}
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-end justify-between">
              <Label hint={t.wizard.transcriptHint} className="mb-0">
                {t.voices.transcript}
              </Label>
              {whisper?.downloaded && (
                <Button size="sm" variant="ghost" icon={<Sparkles size={14} />} loading={transcribing} onClick={() => void transcribe()}>
                  {t.wizard.transcribe}
                </Button>
              )}
            </div>
            <div className="relative">
              <Textarea rows={4} value={text} placeholder={t.wizard.transcriptPlaceholder} onChange={(e) => setText(e.target.value)} disabled={transcribing} />
              {transcribing && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-xl bg-panel-2/80 text-[13px] text-muted">
                  <Spinner /> {t.wizard.transcribing}
                </div>
              )}
            </div>
            {whisper && !whisper.downloaded && (
              <div className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-panel-2 border border-line p-3 text-[13px]">
                <span className="text-muted">{t.wizard.whisperMissing}</span>
                {whisper.downloading ? (
                  <div className="w-40">
                    <Progress value={(whisper.received ?? 0) / Math.max(1, whisper.total ?? whisper.bytes)} />
                  </div>
                ) : (
                  <Button size="sm" icon={<Download size={14} />} onClick={() => void downloadModel(whisperKey)}>
                    {t.common.download} · {bytes(whisper.bytes)}
                  </Button>
                )}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t.voices.name}</Label>
              <Input value={name} placeholder={t.wizard.namePlaceholder} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>{t.voices.language}</Label>
              <Select className="w-full" value={language} onChange={setLanguage} options={catalog.languages.map((l) => ({ value: l, label: t.languages[l] ?? l }))} />
            </div>
          </div>
          <div className="text-xs text-faint">{fmt('{n} с выбрано', { n: regionLen.toFixed(1) })}</div>
        </div>
      )}

      {error && <div className="mt-4 rounded-lg bg-bad/10 border border-bad/30 p-3 text-[13px] text-bad">{error}</div>}
    </Modal>
  )
}
