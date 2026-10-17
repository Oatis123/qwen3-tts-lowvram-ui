import type { Catalog } from '../../../shared/types'
import { t } from '../i18n'

export function modelName(key: string, catalog: Catalog): string {
  if (key.startsWith('whisper-')) return `Whisper ${key.slice(8)}`
  const m = catalog.tts.find((x) => x.id === key)
  return m ? `${t.modes[m.mode]} · ${m.size}` : key
}
