import { Check, Pause, Play, RefreshCw, Wand2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { fmt, t } from '../i18n'
import { api, generate, type GenHandle } from '../lib/api'
import { encodeWav, SR } from '../lib/audio'
import { clipPlayer } from '../lib/player'
import { buildRequest, modelKey, useApp } from '../store'
import { MissingModel } from './MissingModel'
import { Button, Chips, cx, IconButton, Input, Label, Modal, Select, Spinner, Textarea } from './ui'
import { useClipState } from './VoiceSelect'

interface Variant {
  id: number
  state: 'waiting' | 'loading' | 'generating' | 'done' | 'error'
  samples: Float32Array | null
  error?: string
}

const BATCH = 3
const MIN_SEC = 3
const MAX_SEC = 30

const sampleFor = (language: string): string => t.designWizard.samples[language] ?? t.designWizard.samples.English

function VariantRow({ v, index, selected, onSelect }: { v: Variant; index: number; selected: boolean; onSelect: () => void }) {
  const current = useClipState()
  const key = `design-${v.id}`
  const playing = current === key
  const sec = v.samples ? v.samples.length / SR : 0
  const bad = v.state === 'done' && (sec < MIN_SEC || sec > MAX_SEC)
  const ready = v.state === 'done' && !bad
  return (
    <div
      onClick={() => ready && onSelect()}
      className={cx(
        'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors',
        selected ? 'border-accent bg-accent/10' : 'border-line bg-panel-2',
        ready && 'cursor-pointer hover:border-accent/60'
      )}
    >
      <IconButton
        title={t.common.play}
        active={playing}
        disabled={v.state !== 'done'}
        onClick={(e) => {
          e.stopPropagation()
          if (!v.samples) return
          if (playing) clipPlayer.stop()
          else clipPlayer.playSamples(key, v.samples)
        }}
      >
        {playing ? <Pause size={15} /> : <Play size={15} />}
      </IconButton>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium">{fmt(t.designWizard.variant, { n: index + 1 })}</div>
        <div className={cx('text-xs', v.state === 'error' || bad ? 'text-warn' : 'text-faint')}>
          {v.state === 'waiting' && t.designWizard.waiting}
          {v.state === 'loading' && t.designWizard.loadingModel}
          {v.state === 'generating' && t.designWizard.generating}
          {v.state === 'error' && (v.error ?? t.designWizard.failed)}
          {v.state === 'done' && `${sec.toFixed(1)} ${t.common.seconds}${sec < MIN_SEC ? ` · ${t.designWizard.tooShort}` : sec > MAX_SEC ? ` · ${t.designWizard.tooLong}` : ''}`}
        </div>
      </div>
      {(v.state === 'loading' || v.state === 'generating') && <Spinner size={16} />}
      {selected && <Check size={18} className="text-accent-2" />}
    </div>
  )
}

export function DesignVoiceWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useApp((s) => s.settings)
  const catalog = useApp((s) => s.catalog)
  const models = useApp((s) => s.models)
  const refreshVoices = useApp((s) => s.refreshVoices)
  const toast = useApp((s) => s.toast)
  const languages = catalog.languages.filter((l) => l !== 'Auto')
  const initialLanguage = settings.language !== 'Auto' && languages.includes(settings.language) ? settings.language : 'Russian'

  const [step, setStep] = useState(0)
  const [description, setDescription] = useState('')
  const [language, setLanguage] = useState(initialLanguage)
  const [phrase, setPhrase] = useState(sampleFor(initialLanguage))
  const [phraseEdited, setPhraseEdited] = useState(false)
  const [variants, setVariants] = useState<Variant[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const handle = useRef<GenHandle | null>(null)
  const run = useRef(0)
  const nextId = useRef(0)

  const key = modelKey('design', '1.7B')
  const model = models.find((m) => m.key === key)
  const modelReady = !!model?.downloaded

  const stopAll = (): void => {
    run.current++
    handle.current?.stop()
    clipPlayer.stop()
  }

  useEffect(() => {
    if (!open) return
    setStep(0)
    setVariants([])
    setSelected(null)
    setName('')
    setRunning(false)
    return stopAll
  }, [open])

  const update = (id: number, p: Partial<Variant>): void => setVariants((list) => list.map((v) => (v.id === id ? { ...v, ...p } : v)))

  const runOne = (id: number): Promise<void> =>
    new Promise((resolve) => {
      const s = useApp.getState().settings
      const req = buildRequest({ ...s, mode: 'design', language }, catalog, { text: phrase.trim(), instruct: '', design: description.trim() }, true)
      req.params.split = false
      req.save = false
      const chunks: Float32Array[] = []
      update(id, { state: 'generating' })
      handle.current = generate(
        req,
        (e) => {
          if (e.type === 'loading') update(id, { state: 'loading' })
          else if (e.type === 'start') update(id, { state: 'generating' })
          else if (e.type === 'done' || e.type === 'stopped') {
            const total = chunks.reduce((n, c) => n + c.length, 0)
            const out = new Float32Array(total)
            let pos = 0
            for (const c of chunks) {
              out.set(c, pos)
              pos += c.length
            }
            update(id, e.type === 'done' ? { state: 'done', samples: out } : { state: 'error', error: t.designWizard.failed })
            resolve()
          } else if (e.type === 'error') {
            update(id, { state: 'error', error: e.message })
            resolve()
          }
        },
        (pcm) => chunks.push(pcm)
      )
    })

  const runBatch = async (): Promise<void> => {
    const ids = Array.from({ length: BATCH }, () => nextId.current++)
    setVariants((list) => [...list, ...ids.map((id) => ({ id, state: 'waiting' as const, samples: null }))])
    setRunning(true)
    const token = run.current
    for (const id of ids) {
      if (token !== run.current) break
      await runOne(id)
      handle.current = null
    }
    if (token === run.current) setRunning(false)
    void useApp.getState().refreshStatus()
  }

  const start = (): void => {
    setStep(1)
    setVariants([])
    setSelected(null)
    void runBatch()
  }

  const back = (): void => {
    stopAll()
    setRunning(false)
    setStep(0)
  }

  const save = async (): Promise<void> => {
    const v = variants.find((x) => x.id === selected)
    if (!v?.samples) return
    setSaving(true)
    try {
      const voiceName = name.trim() || t.designWizard.defaultName
      await api.voices.create(encodeWav(v.samples), voiceName, phrase.trim(), language, 'design')
      await refreshVoices()
      toast(fmt(t.voices.added, { name: voiceName }), 'ok')
      onClose()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const close = (): void => {
    stopAll()
    onClose()
  }

  const canStart = modelReady && !!description.trim() && !!phrase.trim()

  return (
    <Modal
      open={open}
      onClose={close}
      width="max-w-2xl"
      title={
        <span className="flex items-center gap-2">
          <Wand2 size={18} className="text-accent-2" />
          {t.designWizard.title}
        </span>
      }
      footer={
        step === 0 ? (
          <>
            <Button variant="ghost" onClick={close}>
              {t.common.cancel}
            </Button>
            <Button variant="primary" icon={<Wand2 size={16} />} disabled={!canStart} onClick={start}>
              {t.designWizard.create}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={back}>
              {t.designWizard.edit}
            </Button>
            <div className="flex-1" />
            <Button variant="primary" loading={saving} disabled={selected === null} onClick={() => void save()}>
              {t.designWizard.save}
            </Button>
          </>
        )
      }
    >
      {step === 0 ? (
        <div className="space-y-5">
          <div className="text-[13px] text-muted">{t.designWizard.intro}</div>
          {!modelReady && <MissingModel modelId={key} />}
          <div>
            <Label hint={t.generate.designHint}>{t.generate.design}</Label>
            <Textarea rows={3} autoFocus value={description} placeholder={t.generate.designPlaceholder} onChange={(e) => setDescription(e.target.value)} />
            <Chips items={t.generate.designChips} onPick={setDescription} />
          </div>
          <div>
            <Label>{t.designWizard.language}</Label>
            <Select
              className="w-60"
              value={language}
              onChange={(l) => {
                setLanguage(l)
                if (!phraseEdited) setPhrase(sampleFor(l))
              }}
              options={languages.map((l) => ({ value: l, label: t.languages[l] ?? l }))}
            />
          </div>
          <div>
            <Label hint={t.designWizard.phraseHint}>{t.designWizard.phrase}</Label>
            <Textarea
              rows={3}
              value={phrase}
              onChange={(e) => {
                setPhrase(e.target.value)
                setPhraseEdited(true)
              }}
            />
          </div>
          <div className="text-xs text-faint">{t.designWizard.vramNote}</div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-[13px] text-muted">{t.designWizard.pickHint}</div>
          <div className="space-y-2">
            {variants.map((v, i) => (
              <VariantRow key={v.id} v={v} index={i} selected={selected === v.id} onSelect={() => setSelected(v.id)} />
            ))}
          </div>
          <Button size="sm" icon={<RefreshCw size={14} />} disabled={running} onClick={() => void runBatch()}>
            {t.designWizard.more}
          </Button>
          <div>
            <Label>{t.voices.name}</Label>
            <Input value={name} placeholder={t.designWizard.defaultName} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && selected !== null && void save()} />
          </div>
        </div>
      )}
    </Modal>
  )
}
