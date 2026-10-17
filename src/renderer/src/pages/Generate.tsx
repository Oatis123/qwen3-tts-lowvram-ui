import { Dices, Download, FileAudio, Lock, Mic2, Shuffle, Sparkles, Square, UserRound, Users, Wand2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Mode, Size } from '../../../shared/types'
import { AddVoiceWizard } from '../components/AddVoiceWizard'
import { MissingModel } from '../components/MissingModel'
import { ModelBar } from '../components/ModelBar'
import { ParamsPanel } from '../components/ParamsPanel'
import { PlayerView } from '../components/PlayerView'
import { Badge, Button, Card, Chips, cx, IconButton, Input, Label, Modal, Segmented, Select, Slider, Spinner, Textarea } from '../components/ui'
import { VoiceSelect } from '../components/VoiceSelect'
import { fmt, t } from '../i18n'
import { api } from '../lib/api'
import { estimateSeconds } from '../lib/format'
import { modelKey, player, useApp, useGen } from '../store'

function SpeakerGrid() {
  const speakers = useApp((s) => s.catalog.speakers)
  const value = useApp((s) => s.settings.speaker)
  const patch = useApp((s) => s.patch)
  return (
    <div className="grid grid-cols-3 gap-2">
      {speakers.map((sp) => (
        <button
          key={sp.id}
          onClick={() => void patch({ speaker: sp.id })}
          className={cx('rounded-xl border p-3 text-left transition-colors cursor-pointer', value === sp.id ? 'border-accent bg-accent/10' : 'border-line bg-panel-2 hover:border-line-2')}
        >
          <div className="flex items-center gap-2">
            <span className={cx('flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold', sp.gender === 'f' ? 'bg-pink-400/20 text-pink-300' : 'bg-sky-400/20 text-sky-300')}>
              {sp.name[0]}
            </span>
            <span className="font-medium">{sp.name}</span>
          </div>
          <div className="mt-1.5 text-xs leading-snug text-muted">{t.speakers[sp.id]}</div>
          <div className="mt-1 text-[11px] text-faint">{t.native[sp.native]}</div>
        </button>
      ))}
    </div>
  )
}

function SaveVoiceModal({ open, onClose, historyId }: { open: boolean; onClose: () => void; historyId: string | null }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useApp((s) => s.toast)
  const refreshVoices = useApp((s) => s.refreshVoices)
  const save = async (): Promise<void> => {
    if (!historyId) return
    setBusy(true)
    try {
      await api.voices.fromHistory(historyId, name.trim() || 'Голос')
      await refreshVoices()
      toast(t.generate.saved, 'ok')
      onClose()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.generate.saveVoice}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            {t.common.save}
          </Button>
        </>
      }
    >
      <Label>{t.generate.saveVoiceName}</Label>
      <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void save()} />
    </Modal>
  )
}

export async function exportHistory(id: string, baseName: string, format: 'wav' | 'mp3'): Promise<void> {
  const path = await window.qts.dialog.save(`${baseName}.${format}`, [{ name: format.toUpperCase(), extensions: [format] }])
  if (!path) return
  try {
    await api.history.exportTo(id, path, format)
    useApp.getState().toast(t.history.exported, 'ok')
  } catch (e) {
    useApp.getState().toast((e as Error).message, 'error')
  }
}

export const fileBase = (text: string): string =>
  text
    .trim()
    .slice(0, 40)
    .replace(/[\\/:*?"<>|\r\n]+/g, ' ')
    .trim() || 'speech'

export default function Generate() {
  const settings = useApp((s) => s.settings)
  const catalog = useApp((s) => s.catalog)
  const voices = useApp((s) => s.voices)
  const models = useApp((s) => s.models)
  const status = useApp((s) => s.status)
  const patch = useApp((s) => s.patch)
  const gen = useGen()
  const [wizard, setWizard] = useState(false)
  const [saveVoice, setSaveVoice] = useState(false)

  const mode = settings.mode
  const size: Size = mode === 'design' ? '1.7B' : settings.size
  const key = modelKey(mode, size)
  const modelEntry = models.find((m) => m.key === key)
  const busy = gen.phase === 'connecting' || gen.phase === 'loading' || gen.phase === 'generating'
  const dev = settings.devMode

  useEffect(() => {
    if (mode === 'clone' && !settings.voiceId && voices.length) void patch({ voiceId: voices[0].id })
    if (mode === 'clone' && settings.voiceId && voices.length && !voices.some((v) => v.id === settings.voiceId)) void patch({ voiceId: voices[0].id })
  }, [mode, voices, settings.voiceId, patch])

  const canGenerate =
    !!gen.draft.text.trim() &&
    !busy &&
    !!modelEntry?.downloaded &&
    (mode !== 'clone' || !!settings.voiceId) &&
    (mode !== 'custom' || !!settings.speaker) &&
    (mode !== 'design' || !!gen.draft.design.trim())

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey && e.key === 'Enter' && canGenerate) {
        e.preventDefault()
        gen.start()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canGenerate, gen])

  const modeOptions: { value: Mode; label: React.ReactNode; hint: string }[] = [
    { value: 'clone', label: <span className="flex items-center justify-center gap-2"><Mic2 size={15} />{t.modes.clone}</span>, hint: t.modes.cloneHint },
    { value: 'custom', label: <span className="flex items-center justify-center gap-2"><Users size={15} />{t.modes.custom}</span>, hint: t.modes.customHint },
    { value: 'design', label: <span className="flex items-center justify-center gap-2"><Wand2 size={15} />{t.modes.design}</span>, hint: t.modes.designHint }
  ]

  const statusText = (() => {
    switch (gen.phase) {
      case 'connecting':
        return t.generate.status.connecting
      case 'loading':
        return t.generate.status.loading
      case 'generating':
        return gen.segments > 1 ? `${t.generate.status.generating}: ${t.generate.status.part} ${gen.segment + 1} ${t.generate.status.of} ${gen.segments}` : `${t.generate.status.generating}…`
      case 'stopped':
        return t.generate.status.stopped
      default:
        return null
    }
  })()

  const item = gen.item
  const est = estimateSeconds(gen.draft.text)

  return (
    <div className="flex min-h-full">
      <div className="mx-auto w-full max-w-4xl px-8 py-7">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Segmented className="w-full max-w-xl" value={mode} options={modeOptions} onChange={(m) => void patch({ mode: m })} />
          <div className="flex items-center gap-2">
            {mode === 'design' ? (
              <Badge tone="accent">
                <Lock size={12} /> 1.7B
              </Badge>
            ) : (
              <Segmented<Size>
                value={settings.size}
                onChange={(s) => void patch({ size: s })}
                options={[
                  { value: '0.6B', label: t.sizes['0.6B'], hint: t.sizes['0.6BHint'] },
                  { value: '1.7B', label: t.sizes['1.7B'], hint: t.sizes['1.7BHint'] }
                ]}
              />
            )}
          </div>
        </div>
        <div className="mb-5 -mt-2 text-xs text-faint">
          {mode === 'clone' ? t.modes.cloneHint : mode === 'custom' ? t.modes.customHint : t.modes.designHint}
          {' · '}
          {mode === 'design' ? t.sizes.designOnly : t.sizes[`${size}Hint` as '0.6BHint']}
        </div>

        <div className="space-y-4">
          {modelEntry && !modelEntry.downloaded ? <MissingModel modelId={key} /> : <ModelBar modelKey={key} busy={busy} />}
          {gen.missingModel && gen.missingModel !== key && <MissingModel modelId={gen.missingModel} />}

          <Card className="p-5">
            {mode === 'clone' && (
              <div className="grid grid-cols-[1fr_auto] items-end gap-3">
                <div>
                  <Label>{t.generate.voice}</Label>
                  <VoiceSelect voices={voices} value={settings.voiceId} onChange={(id) => void patch({ voiceId: id })} onAdd={() => setWizard(true)} />
                </div>
                <Button className="h-14" icon={<UserRound size={16} />} onClick={() => setWizard(true)}>
                  {t.generate.addVoice}
                </Button>
              </div>
            )}
            {mode === 'custom' && (
              <>
                <Label>{t.generate.voice}</Label>
                <SpeakerGrid />
              </>
            )}
            {mode === 'design' && (
              <>
                <Label hint={t.generate.designHint}>{t.generate.design}</Label>
                <Textarea rows={2} value={gen.draft.design} placeholder={t.generate.designPlaceholder} onChange={(e) => gen.setDraft({ design: e.target.value })} />
                <Chips items={t.generate.designChips} onPick={(v) => gen.setDraft({ design: v })} />
              </>
            )}
            {(mode === 'custom' || (mode === 'clone' && dev)) && (
              <div className="mt-4">
                <Label hint={t.generate.styleHint}>{t.generate.style}</Label>
                <Input value={gen.draft.instruct} placeholder={t.generate.stylePlaceholder} onChange={(e) => gen.setDraft({ instruct: e.target.value })} />
                <Chips items={t.generate.styleChips} onPick={(v) => gen.setDraft({ instruct: v })} />
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-2 flex items-center justify-between gap-4">
              <div className="text-[13px] font-medium text-muted">{t.generate.text}</div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-faint">{t.generate.language}</span>
                <Select
                  className="h-8 text-[13px]"
                  value={settings.language}
                  onChange={(l) => void patch({ language: l })}
                  options={catalog.languages.map((l) => ({ value: l, label: t.languages[l] ?? l }))}
                />
              </div>
            </div>
            <Textarea
              rows={7}
              value={gen.draft.text}
              placeholder={t.generate.textPlaceholder}
              onChange={(e) => gen.setDraft({ text: e.target.value })}
              className="min-h-40"
            />
            <div className="mt-2 flex items-center justify-between text-xs text-faint">
              <span>
                {gen.draft.text.length} {t.generate.chars}
                {est > 0 && ` · ${t.generate.approx} ${est} ${t.common.seconds}`}
              </span>
              <span>{t.generate.shortcut}</span>
            </div>

            {!dev && (
              <div className="mt-4 flex items-center gap-4">
                <span className="w-16 text-[13px] text-muted">{t.generate.expressive}</span>
                <span className="text-xs text-faint">{t.generate.calm}</span>
                <Slider className="max-w-64" value={settings.expressiveness} min={0} max={1} step={0.05} onChange={(v) => void patch({ expressiveness: v })} />
                <span className="text-xs text-faint">{t.generate.lively}</span>
              </div>
            )}

            <div className="mt-5 flex items-center gap-3">
              {busy ? (
                <Button size="lg" variant="danger" icon={<Square size={14} fill="currentColor" />} onClick={() => gen.stop()}>
                  {t.generate.stop}
                </Button>
              ) : (
                <Button size="lg" variant="primary" icon={<Sparkles size={18} />} disabled={!canGenerate} onClick={() => gen.start()}>
                  {t.generate.generate}
                </Button>
              )}
              {statusText && (
                <div className="flex items-center gap-2 text-[13px] text-muted">
                  {busy && <Spinner />}
                  {statusText}
                </div>
              )}
            </div>
            {gen.phase === 'error' && gen.error && <div className="mt-4 rounded-lg bg-bad/10 border border-bad/30 p-3 text-[13px] text-bad">{gen.error}</div>}
          </Card>

          {(player.length > 0 || busy) && (
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[13px] font-medium text-muted">{t.generate.result}</div>
                {gen.stats && gen.phase === 'done' && (
                  <div className="text-xs text-faint">
                    {fmt(t.generate.stats, { first: gen.stats.first_chunk_ms, speed: gen.stats.rtf ? (1 / gen.stats.rtf).toFixed(1) : '—' })}
                  </div>
                )}
              </div>
              <PlayerView
                player={player}
                expectedSeconds={est}
                actions={
                  item && (
                    <>
                      <IconButton title={`${t.generate.saveAs} WAV`} onClick={() => void exportHistory(item.id, fileBase(item.text), 'wav')}>
                        <FileAudio size={17} />
                      </IconButton>
                      <IconButton title={`${t.generate.saveAs} MP3`} onClick={() => void exportHistory(item.id, fileBase(item.text), 'mp3')}>
                        <Download size={17} />
                      </IconButton>
                    </>
                  )
                }
              />
              {item && gen.phase === 'done' && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" icon={dev && settings.params.seed != null ? <Dices size={14} /> : <Shuffle size={14} />} disabled={!canGenerate} onClick={() => gen.start({ newSeed: true })}>
                    {t.generate.another}
                  </Button>
                  {(item.mode === 'design' || item.mode === 'custom') && (
                    <Button size="sm" icon={<UserRound size={14} />} onClick={() => setSaveVoice(true)}>
                      {t.generate.saveVoice}
                    </Button>
                  )}
                  {dev && <span className="self-center text-xs text-faint">seed {item.seed}</span>}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      {dev && (
        <aside className="sticky top-0 h-[calc(100vh-40px)] w-80 shrink-0 overflow-y-auto border-l border-line bg-panel pb-16">
          <div className="px-4 pt-5 pb-2 text-[15px] font-semibold">{t.dev.params}</div>
          <ParamsPanel size={size} />
        </aside>
      )}

      <AddVoiceWizard open={wizard} onClose={() => setWizard(false)} onCreated={(v) => void patch({ voiceId: v.id, mode: 'clone' })} />
      <SaveVoiceModal open={saveVoice} onClose={() => setSaveVoice(false)} historyId={item?.id ?? null} />
    </div>
  )
}
