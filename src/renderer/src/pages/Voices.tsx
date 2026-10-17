import { FileDown, FileUp, Library, MoreHorizontal, Pencil, Plus, Sparkles, Trash2, Wand2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { AddVoiceWizard } from '../components/AddVoiceWizard'
import { DesignVoiceWizard } from '../components/DesignVoiceWizard'
import { Button, Card, Empty, IconButton, Input, Label, Modal, PageHeader, Select, Textarea } from '../components/ui'
import { PreviewButton } from '../components/VoiceSelect'
import { fmt, t } from '../i18n'
import { api, type Voice } from '../lib/api'
import { date } from '../lib/format'
import { useApp } from '../store'

function EditModal({ voice, onClose }: { voice: Voice | null; onClose: () => void }) {
  const catalog = useApp((s) => s.catalog)
  const refreshVoices = useApp((s) => s.refreshVoices)
  const toast = useApp((s) => s.toast)
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [language, setLanguage] = useState('Auto')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!voice) return
    setName(voice.name)
    setText(voice.text)
    setLanguage(voice.language)
  }, [voice])

  const save = async (): Promise<void> => {
    if (!voice) return
    setBusy(true)
    try {
      await api.voices.update(voice.id, { name, text, language })
      await refreshVoices()
      onClose()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={!!voice}
      onClose={onClose}
      title={t.voices.editTitle}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" loading={busy} disabled={!text.trim()} onClick={() => void save()}>
            {t.common.save}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t.voices.name}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>{t.voices.language}</Label>
            <Select className="w-full" value={language} onChange={setLanguage} options={catalog.languages.map((l) => ({ value: l, label: t.languages[l] ?? l }))} />
          </div>
        </div>
        <div>
          <Label hint={t.wizard.transcriptHint}>{t.voices.transcript}</Label>
          <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      </div>
    </Modal>
  )
}

function VoiceMenu({ voice, onEdit }: { voice: Voice; onEdit: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const refreshVoices = useApp((s) => s.refreshVoices)
  const toast = useApp((s) => s.toast)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const exportVoice = async (): Promise<void> => {
    setOpen(false)
    const path = await window.qts.dialog.save(`${voice.name}.voice`, [{ name: 'Voice', extensions: ['voice'] }])
    if (!path) return
    await api.voices.exportTo(voice.id, path)
    toast(t.voices.exported, 'ok')
  }

  const remove = async (): Promise<void> => {
    setOpen(false)
    if (!confirm(fmt(t.voices.deleteConfirm, { name: voice.name }))) return
    await api.voices.remove(voice.id)
    await refreshVoices()
  }

  const item = 'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] hover:bg-line/50 cursor-pointer'
  return (
    <div ref={ref} className="relative">
      <IconButton title="Ещё" onClick={() => setOpen(!open)}>
        <MoreHorizontal size={16} />
      </IconButton>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-line bg-panel-2 p-1 shadow-2xl">
          <button className={item} onClick={() => (setOpen(false), onEdit())}>
            <Pencil size={14} /> {t.common.edit}
          </button>
          <button className={item} onClick={() => void exportVoice()}>
            <FileDown size={14} /> {t.voices.export}
          </button>
          <button className={`${item} text-bad`} onClick={() => void remove()}>
            <Trash2 size={14} /> {t.common.delete}
          </button>
        </div>
      )}
    </div>
  )
}

export default function Voices() {
  const voices = useApp((s) => s.voices)
  const patch = useApp((s) => s.patch)
  const go = useApp((s) => s.go)
  const refreshVoices = useApp((s) => s.refreshVoices)
  const toast = useApp((s) => s.toast)
  const [wizard, setWizard] = useState(false)
  const [designer, setDesigner] = useState(false)
  const [editing, setEditing] = useState<Voice | null>(null)

  const importVoice = async (): Promise<void> => {
    const path = await window.qts.dialog.open([{ name: 'Voice', extensions: ['voice', 'zip'] }])
    if (!path) return
    try {
      await api.voices.importFrom(path)
      await refreshVoices()
      toast(t.voices.imported, 'ok')
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const use = (v: Voice): void => {
    void patch({ voiceId: v.id, mode: 'clone' })
    go('generate')
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-7">
      <PageHeader
        title={t.voices.title}
        subtitle={t.voices.subtitle}
        actions={
          <>
            <Button icon={<FileUp size={16} />} onClick={() => void importVoice()}>
              {t.voices.import}
            </Button>
            <Button icon={<Wand2 size={16} />} onClick={() => setDesigner(true)}>
              {t.designWizard.button}
            </Button>
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => setWizard(true)}>
              {t.voices.add}
            </Button>
          </>
        }
      />
      {voices.length === 0 ? (
        <Card>
          <Empty
            icon={<Library size={26} />}
            title={t.voices.empty}
            text={t.voices.emptyHint}
            action={
              <div className="flex gap-2">
                <Button icon={<Wand2 size={16} />} onClick={() => setDesigner(true)}>
                  {t.designWizard.button}
                </Button>
                <Button variant="primary" icon={<Plus size={16} />} onClick={() => setWizard(true)}>
                  {t.voices.add}
                </Button>
              </div>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          {voices.map((v) => (
            <Card key={v.id} className="flex flex-col p-4">
              <div className="flex items-start gap-2">
                <PreviewButton voice={v} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{v.name}</div>
                  <div className="text-xs text-faint">
                    {t.languages[v.language] ?? v.language} · {v.duration.toFixed(1)} {t.common.seconds} · {date(v.created)}
                  </div>
                </div>
                <VoiceMenu voice={v} onEdit={() => setEditing(v)} />
              </div>
              <div data-selectable className="mt-3 line-clamp-3 flex-1 text-[13px] leading-relaxed text-muted">
                {v.text}
              </div>
              <Button className="mt-4" size="sm" icon={<Sparkles size={14} />} onClick={() => use(v)}>
                {t.voices.use}
              </Button>
            </Card>
          ))}
        </div>
      )}
      <div className="mt-6 text-xs text-faint">{t.voices.consent}</div>
      <AddVoiceWizard open={wizard} onClose={() => setWizard(false)} />
      <DesignVoiceWizard open={designer} onClose={() => setDesigner(false)} />
      <EditModal voice={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
