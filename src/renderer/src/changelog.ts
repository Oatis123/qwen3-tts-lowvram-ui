export interface Release {
  version: string
  items: string[]
}

export const CHANGELOG: Release[] = [
  {
    version: '1.0.2',
    items: [
      'Речь стала ровнее на длинных текстах: текст делится на крупные куски (до ~500 символов) только по концам предложений, а куски выравниваются по длине. Интонация и темп меньше скачут между частями.',
      'Голос можно создать из любого аудио или видео: WMA, AMR, AIFF, MP4, MKV, AVI, MOV и других. Программа сама переведёт файл в нужный формат. Из длинных файлов берутся первые 10 минут.',
      'Новый мастер «Придумать голос» в библиотеке голосов: опишите голос словами, прослушайте несколько вариантов и сохраните лучший. Он станет обычным голосом для клонирования и будет работать с быстрой моделью 0.6B.',
      'После обновления показывается это окно со списком изменений.'
    ]
  },
  {
    version: '1.0.1',
    items: [
      'Обновления только с вашего согласия: в боковой панели появляется уведомление и кнопка «Установить».',
      'Модели загружаются в видеопамять только по кнопке «Загрузить» и выгружаются крестиком в боковой панели.',
      'В боковой панели видны загруженные модели и прогресс скачивания.',
      'При первом запуске скачивается только Whisper, остальные модели — по желанию.'
    ]
  },
  {
    version: '1.0.0',
    items: ['Первый выпуск Qwen TTS Studio.']
  }
]

const parts = (v: string): number[] => v.split('.').map((x) => parseInt(x, 10) || 0)

export function compareVersions(a: string, b: string): number {
  const x = parts(a)
  const y = parts(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d) return d
  }
  return 0
}

export function releasesBetween(since: string | null, current: string): Release[] {
  return CHANGELOG.filter((r) => compareVersions(r.version, current) <= 0 && (since ? compareVersions(r.version, since) > 0 : r.version === current))
}
