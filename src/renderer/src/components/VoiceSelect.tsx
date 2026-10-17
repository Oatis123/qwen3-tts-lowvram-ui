import { ChevronDown, Pause, Play, Plus, Search, UserRound } from 'lucide-react'
import { useEffect, useReducer, useRef, useState } from 'react'
import { t } from '../i18n'
import { api, type Voice } from '../lib/api'
import { clipPlayer } from '../lib/player'
import { cx, IconButton } from './ui'

export function useClipState(): string | null {
  const [, force] = useReducer((x: number) => x + 1, 0)
  useEffect(() => clipPlayer.subscribe(force), [])
  return clipPlayer.current
}

export function PreviewButton({ voice }: { voice: Voice }) {
  const current = useClipState()
  const playing = current === voice.id
  return (
    <IconButton
      title={t.common.play}
      active={playing}
      onClick={(e) => {
        e.stopPropagation()
        clipPlayer.toggle(voice.id, api.voices.audioUrl(voice.id))
      }}
    >
      {playing ? <Pause size={15} /> : <Play size={15} />}
    </IconButton>
  )
}

export function VoiceSelect({
  voices,
  value,
  onChange,
  onAdd
}: {
  voices: Voice[]
  value: string | null
  onChange: (id: string) => void
  onAdd: () => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const current = voices.find((v) => v.id === value)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const filtered = voices.filter((v) => v.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-14 w-full items-center gap-3 rounded-xl bg-panel-2 border border-line px-3 text-left hover:border-line-2 cursor-pointer"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent-2">
          <UserRound size={18} />
        </div>
        <div className="min-w-0 flex-1">
          {current ? (
            <>
              <div className="truncate font-medium">{current.name}</div>
              <div className="truncate text-xs text-faint">
                {t.languages[current.language] ?? current.language} · {current.duration.toFixed(0)} {t.common.seconds}
              </div>
            </>
          ) : (
            <div className="text-muted">{voices.length ? t.generate.pickVoice : t.generate.noVoices}</div>
          )}
        </div>
        {current && <PreviewButton voice={current} />}
        <ChevronDown size={16} className="text-faint" />
      </button>
      {open && (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-line bg-panel-2 shadow-2xl">
          {voices.length > 6 && (
            <div className="flex items-center gap-2 border-b border-line px-3">
              <Search size={14} className="text-faint" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.common.search} className="h-10 flex-1 bg-transparent outline-none placeholder:text-faint" />
            </div>
          )}
          <div className="max-h-72 overflow-y-auto p-1">
            {filtered.map((v) => (
              <div
                key={v.id}
                onClick={() => {
                  onChange(v.id)
                  setOpen(false)
                }}
                className={cx('flex items-center gap-3 rounded-lg px-2 py-2 cursor-pointer', v.id === value ? 'bg-accent/15' : 'hover:bg-line/50')}
              >
                <PreviewButton voice={v} />
                <div className="min-w-0 flex-1">
                  <div className="truncate">{v.name}</div>
                  <div className="truncate text-xs text-faint">{v.text}</div>
                </div>
                <span className="text-xs text-faint">{v.duration.toFixed(0)} {t.common.seconds}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              setOpen(false)
              onAdd()
            }}
            className="flex w-full items-center gap-2 border-t border-line px-4 py-3 text-[13px] text-accent-2 hover:bg-line/40 cursor-pointer"
          >
            <Plus size={16} /> {t.generate.addVoice}
          </button>
        </div>
      )}
    </div>
  )
}
