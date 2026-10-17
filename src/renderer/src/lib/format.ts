export function bytes(n: number | undefined | null): string {
  if (!n) return '0 МБ'
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)} ГБ`
  return `${Math.max(1, Math.round(n / 1e6))} МБ`
}

export const gib = (n: number | undefined | null): string => `${((n ?? 0) / 2 ** 30).toFixed(2)} GiB`

export function date(ts: number): string {
  const d = new Date(ts * 1000)
  const today = new Date()
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === today.toDateString()) return `сегодня, ${time}`
  const y = new Date(today)
  y.setDate(today.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return `вчера, ${time}`
  return `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${time}`
}

export function estimateSeconds(text: string): number {
  return Math.round(text.trim().length / 14)
}
