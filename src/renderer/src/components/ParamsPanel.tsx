import { RotateCcw, Save, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { DEFAULT_PARAMS } from '../../../shared/defaults'
import type { GenParams, Size } from '../../../shared/types'
import { t } from '../i18n'
import { useApp, useGen } from '../store'
import { Button, IconButton, Input, NumberInput, Segmented, Select, Slider, Toggle } from './ui'

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[13px]" title={hint}>
          {label}
        </div>
        <div className="flex items-center gap-2">{children}</div>
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-faint">{hint}</div>}
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-line px-4 py-3 last:border-0">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-faint">{title}</div>
      {children}
    </div>
  )
}

function SliderNum({ value, min, max, step, onChange }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <>
      <Slider className="w-24" value={value} min={min} max={max} step={step} onChange={onChange} />
      <NumberInput className="w-16" value={value} min={min} max={max} step={step} onChange={(v) => onChange(v ?? min)} />
    </>
  )
}

export function ParamsPanel({ size }: { size: Size }) {
  const settings = useApp((s) => s.settings)
  const patch = useApp((s) => s.patch)
  const lastSeed = useGen((s) => s.lastSeed)
  const [presetName, setPresetName] = useState('')
  const [preset, setPreset] = useState('')
  const p = settings.params
  const set = (k: Partial<GenParams>): void => void patch({ params: { ...p, ...k } })

  return (
    <div className="text-fg">
      <Group title={t.dev.presets}>
        <div className="flex gap-2 py-1">
          <Select
            className="flex-1 min-w-0"
            value={preset}
            onChange={(name) => {
              setPreset(name)
              const found = settings.presets.find((x) => x.name === name)
              if (found) set(found.params)
            }}
            options={[{ value: '', label: '—' }, ...settings.presets.map((x) => ({ value: x.name, label: x.name }))]}
          />
          {preset && (
            <IconButton title={t.common.delete} onClick={() => {
              void patch({ presets: settings.presets.filter((x) => x.name !== preset) })
              setPreset('')
            }}>
              <Trash2 size={15} />
            </IconButton>
          )}
          <IconButton title={t.dev.defaults} onClick={() => void patch({ params: { ...DEFAULT_PARAMS } })}>
            <RotateCcw size={15} />
          </IconButton>
        </div>
        <div className="flex gap-2 py-1">
          <Input className="h-8 text-[13px]" placeholder={t.dev.presetName} value={presetName} onChange={(e) => setPresetName(e.target.value)} />
          <Button
            size="sm"
            icon={<Save size={14} />}
            disabled={!presetName.trim()}
            onClick={() => {
              const name = presetName.trim()
              void patch({ presets: [...settings.presets.filter((x) => x.name !== name), { name, params: { ...p, seed: p.seed } }] })
              setPreset(name)
              setPresetName('')
            }}
          />
        </div>
      </Group>

      <Group title="Сэмплирование">
        <Field label="temperature" hint="Выше — разнообразнее и эмоциональнее, ниже — стабильнее">
          <SliderNum value={p.temperature} min={0.1} max={1.5} step={0.05} onChange={(v) => set({ temperature: v })} />
        </Field>
        <Field label="top_k">
          <SliderNum value={p.top_k} min={1} max={200} step={1} onChange={(v) => set({ top_k: v })} />
        </Field>
        <Field label="top_p">
          <SliderNum value={p.top_p} min={0.05} max={1} step={0.05} onChange={(v) => set({ top_p: v })} />
        </Field>
        <Field label="repetition_penalty">
          <SliderNum value={p.repetition_penalty} min={1} max={1.5} step={0.01} onChange={(v) => set({ repetition_penalty: v })} />
        </Field>
        <Field label="do_sample" hint="Выкл — жадное декодирование">
          <Toggle checked={p.do_sample} onChange={(v) => set({ do_sample: v })} />
        </Field>
        <Field label="seed" hint={lastSeed != null ? `${t.dev.lastSeed}: ${lastSeed}` : undefined}>
          <NumberInput value={p.seed} placeholder="random" onChange={(v) => set({ seed: v })} className="w-28" />
          {lastSeed != null && (
            <button className="text-[11px] text-accent-2 cursor-pointer" onClick={() => set({ seed: lastSeed })}>
              {t.dev.useLast}
            </button>
          )}
        </Field>
      </Group>

      <Group title="Длина">
        <Field label="max_new_tokens" hint="12.5 токенов ≈ 1 с аудио">
          <NumberInput value={p.max_new_tokens} min={16} max={8192} onChange={(v) => set({ max_new_tokens: v ?? 2048 })} />
        </Field>
        <Field label="min_new_tokens">
          <NumberInput value={p.min_new_tokens} min={0} max={512} onChange={(v) => set({ min_new_tokens: v ?? 2 })} />
        </Field>
        <Field label="Разбивать текст" hint="Длинный текст озвучивается по кускам, чтобы не упереться в max_seq_len">
          <Toggle checked={p.split} onChange={(v) => set({ split: v })} />
        </Field>
        {p.split && (
          <Field label="split_chars" hint="Максимум символов в одном куске">
            <NumberInput value={p.split_chars} min={40} max={1000} onChange={(v) => set({ split_chars: v ?? 220 })} />
          </Field>
        )}
      </Group>

      <Group title="Стриминг">
        <Field label="chunk_size" hint="Кадров кодека в чанке (12.5 = 1 с). Меньше — быстрее первый звук">
          <SliderNum value={p.chunk_size} min={1} max={24} step={1} onChange={(v) => set({ chunk_size: v })} />
        </Field>
        <Field label="non_streaming_mode">
          <Segmented
            value={p.non_streaming_mode === null ? 'auto' : p.non_streaming_mode ? 'on' : 'off'}
            onChange={(v) => set({ non_streaming_mode: v === 'auto' ? null : v === 'on' })}
            options={[
              { value: 'auto', label: t.dev.nonStreaming.auto },
              { value: 'on', label: t.dev.nonStreaming.on },
              { value: 'off', label: t.dev.nonStreaming.off }
            ]}
          />
        </Field>
      </Group>

      <Group title="Клонирование">
        <Field label="xvec_only" hint="Только эмбеддинг спикера: лучше для другого языка, менее похоже">
          <Toggle checked={p.xvec_only} onChange={(v) => set({ xvec_only: v })} />
        </Field>
        <Field label="append_silence" hint="0.5 с тишины после референса, чтобы не тянулся последний звук">
          <Toggle checked={p.append_silence} onChange={(v) => set({ append_silence: v })} />
        </Field>
      </Group>

      <Group title="lowvram">
        <Field label="decode_context" hint="Кадров референса для декодера (0 = весь референс)">
          <NumberInput value={p.decode_context} min={0} max={1000} onChange={(v) => set({ decode_context: v ?? 0 })} />
        </Field>
        <Field label={`VRAM cap, ГБ (${size})`} hint="Пусто — без лимита">
          <NumberInput
            value={settings.vramCap[size]}
            min={0.5}
            max={48}
            step={0.1}
            placeholder="нет"
            onChange={(v) => void patch({ vramCap: { ...settings.vramCap, [size]: v && v > 0 ? v : null } })}
          />
        </Field>
      </Group>
    </div>
  )
}
