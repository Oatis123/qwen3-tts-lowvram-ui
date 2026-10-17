import { Loader2, X } from 'lucide-react'
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react'

export const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ')

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-2 disabled:bg-accent/40',
  secondary: 'bg-panel-2 border border-line text-fg hover:border-line-2 hover:bg-line/40',
  ghost: 'text-muted hover:text-fg hover:bg-panel-2',
  danger: 'bg-bad/10 text-bad border border-bad/30 hover:bg-bad/20'
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap',
        size === 'sm' && 'h-8 px-3 text-[13px]',
        size === 'md' && 'h-9 px-4',
        size === 'lg' && 'h-11 px-6 text-[15px]',
        variants[variant],
        className
      )}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
      {children}
    </button>
  )
}

export function IconButton({ title, className, children, active, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...rest}
      title={title}
      aria-label={title}
      className={cx(
        'inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',
        active ? 'bg-accent/20 text-accent-2' : 'text-muted hover:text-fg hover:bg-panel-2',
        className
      )}
    >
      {children}
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className
}: {
  value: T
  options: { value: T; label: ReactNode; hint?: string; disabled?: boolean }[]
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div className={cx('inline-flex rounded-xl bg-panel-2 border border-line p-1 gap-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          title={o.hint}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex-1 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40',
            value === o.value ? 'bg-accent text-white shadow' : 'text-muted hover:text-fg'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Select({
  value,
  onChange,
  options,
  className,
  disabled
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  className?: string
  disabled?: boolean
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cx(
        'h-9 rounded-lg bg-panel-2 border border-line px-3 pr-8 text-fg outline-none focus:border-accent cursor-pointer disabled:opacity-50',
        className
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-5 w-9 shrink-0 rounded-full transition-colors cursor-pointer disabled:opacity-50',
        checked ? 'bg-accent' : 'bg-line-2'
      )}
    >
      <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
    </button>
  )
}

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  className
}: {
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  className?: string
}) {
  const fill = ((value - min) / (max - min)) * 100
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cx('w-full cursor-pointer', className)}
      style={{ ['--fill' as string]: `${fill}%` }}
    />
  )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        'h-9 w-full rounded-lg bg-panel-2 border border-line px-3 text-fg outline-none placeholder:text-faint focus:border-accent',
        props.className
      )}
    />
  )
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  placeholder,
  className
}: {
  value: number | null
  onChange: (v: number | null) => void
  min?: number
  max?: number
  step?: number
  placeholder?: string
  className?: string
}) {
  return (
    <input
      type="number"
      value={value ?? ''}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      className={cx(
        'h-8 w-24 rounded-md bg-panel-2 border border-line px-2 text-right font-mono text-[13px] text-fg outline-none focus:border-accent',
        className
      )}
    />
  )
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx(
        'w-full resize-none rounded-xl bg-panel-2 border border-line px-4 py-3 text-[15px] leading-relaxed text-fg outline-none placeholder:text-faint focus:border-accent',
        props.className
      )}
    />
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-2xl bg-panel border border-line', className)}>{children}</div>
}

export function Label({ children, hint, className }: { children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cx('mb-2', className)}>
      <div className="text-[13px] font-medium text-muted">{children}</div>
      {hint && <div className="text-xs text-faint mt-0.5">{hint}</div>}
    </div>
  )
}

export function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3 border-b border-line last:border-0">
      <div className="min-w-0">
        <div className="text-[14px]">{label}</div>
        {hint && <div className="text-xs text-faint mt-0.5">{hint}</div>}
      </div>
      <div className="shrink-0 flex items-center gap-2">{children}</div>
    </div>
  )
}

export function Progress({ value, className, indeterminate }: { value?: number; className?: string; indeterminate?: boolean }) {
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-line', className)}>
      {indeterminate ? (
        <div className="indeterminate">
          <div className="rounded-full bg-accent" />
        </div>
      ) : (
        <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${Math.max(0, Math.min(100, (value ?? 0) * 100))}%` }} />
      )}
    </div>
  )
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'ok' | 'warn' | 'bad' | 'accent' }) {
  const tones = {
    muted: 'bg-line text-muted',
    ok: 'bg-ok/15 text-ok',
    warn: 'bg-warn/15 text-warn',
    bad: 'bg-bad/15 text-bad',
    accent: 'bg-accent/20 text-accent-2'
  }
  return <span className={cx('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin text-accent" />
}

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 'max-w-lg',
  footer
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  width?: string
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 no-drag" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx('w-full rounded-2xl bg-panel border border-line shadow-2xl flex flex-col max-h-full', width)}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div className="text-lg font-semibold">{title}</div>
          <IconButton title="Закрыть" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="px-6 pb-5 overflow-y-auto">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
      </div>
    </div>
  )
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-panel-2 text-accent">{icon}</div>
      <div className="text-base font-semibold">{title}</div>
      {text && <div className="mt-1 max-w-md text-[13px] text-muted">{text}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <div className="text-[13px] text-muted mt-1">{subtitle}</div>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <Card className="p-5 mb-4">
      <div className="text-[15px] font-semibold">{title}</div>
      {hint && <div className="text-xs text-faint mt-1">{hint}</div>}
      <div className="mt-2">{children}</div>
    </Card>
  )
}
