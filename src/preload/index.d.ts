import type { QtsApi } from '../shared/types'

declare global {
  interface Window {
    qts: QtsApi
  }
}
