import { Clock, Download, FileAudio, Pause, Play, Repeat, Search, Trash2, UserRound } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Empty, IconButton, Input, Label, Modal, PageHeader, Spinner } from '../components/ui'
import { useClipState } from '../components/VoiceSelect'
import { t } from '../i18n'
import { api, type HistoryItem } from '../lib/api'
import { fetchSamples } from '../lib/audio'
import { date } from '../lib/format'
import { clipPlayer } from '../lib/player'
import { useApp, useGen } from '../store'
import { exportHistory, fileBase } from './Generate'

const modeLabel = (m: HistoryItem['mode']): string => t.modes[m]

export default function History() {
  const version = useApp((s) => s.historyVersion)
  const settings = useApp((s) => s.settings)
  const patch = useApp((s) => s.patch)
  const go = useApp((s) => s.go)
  const toast = useApp((s) => s.toast)
  const refreshVoices = useApp((s) => s.refreshVoices)
  const [items, setItems] = useState<HistoryItem[]>([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [asVoice, setAsVoice] = useState<HistoryItem | null>(null)
  const [voiceName, setVoiceName] = useState('')
  const clip = useClipState()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.history.list(q)
      setItems(r.items)
      setTotal(r.total)
    } finally {
      setLoading(false)
    }
  }, [q])

  useEffect(() => {
    const id = setTimeout(() => void load(), 200)
    return () => clearTimeout(id)
  }, [load, version])

  const reuse = async (it: HistoryItem): Promise<void> => {
    const p: Parameters<typeof patch>[0] = { mode: it.mode, language: it.language || 'Auto' }
    if (it.mode !== 'design') p.size = it.size
    if (it.mode === 'clone' && it.voice_id) p.voiceId = it.voice_id
    if (it.mode === 'custom' && it.speaker) p.speaker = it.speaker
    if (settings.devMode && it.params) p.params = { ...settings.params, ...it.params, seed: it.seed }
    await patch(p)
    useGen.getState().setDraft({
      text: it.text,
      instruct: it.mode !== 'design' ? (it.instruct ?? '') : useGen.getState().draft.instruct,
      design: it.mode === 'design' ? (it.instruct ?? '') : useGen.getState().draft.design
    })
    try {
      useGen.getState().showItem(it, await fetchSamples(api.history.audioUrl(it.id)))
    } catch {
      /* audio missing */
    }
    go('generate')
  }

  const remove = async (it: HistoryItem): Promise<void> => {
    if (clipPlayer.current === it.id) clipPlayer.stop()
    await api.history.remove(it.id)
    void load()
  }

  const clearAll = async (): Promise<void> => {
    if (!confirm(t.history.clearConfirm)) return
    clipPlayer.stop()
    await api.history.clear()
    void load()
  }

  const saveVoice = async (): Promise<void> => {
    if (!asVoice) return
    try {
      await api.voices.fromHistory(asVoice.id, voiceName.trim() || 'Голос')
      await refreshVoices()
      toast(t.generate.saved, 'ok')
      setAsVoice(null)
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-7">
      <PageHeader
        title={t.history.title}
        subtitle={t.history.subtitle}
        actions={
          <>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <Input className="w-64 pl-8" placeholder={t.common.search} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {total > 0 && (
              <Button variant="ghost" icon={<Trash2 size={15} />} onClick={() => void clearAll()}>
                {t.history.clear}
              </Button>
            )}
          </>
        }
      />
      {loading && !items.length ? (
        <div className="flex justify-center py-16">
          <Spinner size={24} />
        </div>
      ) : !items.length ? (
        <Card>
          <Empty icon={<Clock size={26} />} title={t.history.empty} />
        </Card>
      ) : (
        <Card className="divide-y divide-line">
          {items.map((it) => (
            <div key={it.id} className="flex items-center gap-3 px-4 py-3">
              <IconButton title={t.common.play} active={clip === it.id} onClick={() => clipPlayer.toggle(it.id, api.history.audioUrl(it.id))}>
                {clip === it.id ? <Pause size={16} /> : <Play size={16} />}
              </IconButton>
              <div className="min-w-0 flex-1">
                <div data-selectable className="truncate text-[14px]" title={it.text}>
                  {it.text}
                </div>
                <div className="mt-0.5 truncate text-xs text-faint">
                  {modeLabel(it.mode)} · {it.voice_name || '—'} · {it.size} · {it.duration.toFixed(1)} {t.common.seconds} · {date(it.created)}
                  {settings.devMode && ` · seed ${it.seed}`}
                </div>
              </div>
              <div className="flex shrink-0 items-center">
                <IconButton title={t.history.reuse} onClick={() => void reuse(it)}>
                  <Repeat size={16} />
                </IconButton>
                <IconButton title={t.history.asVoice} onClick={() => (setVoiceName(''), setAsVoice(it))}>
                  <UserRound size={16} />
                </IconButton>
                <IconButton title="WAV" onClick={() => void exportHistory(it.id, fileBase(it.text), 'wav')}>
                  <FileAudio size={16} />
                </IconButton>
                <IconButton title="MP3" onClick={() => void exportHistory(it.id, fileBase(it.text), 'mp3')}>
                  <Download size={16} />
                </IconButton>
                <IconButton title={t.common.delete} onClick={() => void remove(it)}>
                  <Trash2 size={16} />
                </IconButton>
              </div>
            </div>
          ))}
        </Card>
      )}
      <Modal
        open={!!asVoice}
        onClose={() => setAsVoice(null)}
        title={t.generate.saveVoice}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAsVoice(null)}>
              {t.common.cancel}
            </Button>
            <Button variant="primary" onClick={() => void saveVoice()}>
              {t.common.save}
            </Button>
          </>
        }
      >
        <Label>{t.generate.saveVoiceName}</Label>
        <Input autoFocus value={voiceName} onChange={(e) => setVoiceName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void saveVoice()} />
      </Modal>
    </div>
  )
}
