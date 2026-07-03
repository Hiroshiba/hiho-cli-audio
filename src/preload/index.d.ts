import { ElectronAPI } from '@electron-toolkit/preload'
import type { AppError, ErrorDialogOptions } from '../shared/types/error'
import type { HistoryItem } from '../shared/types/history'

interface API {
  error: {
    show: (error: AppError, options?: ErrorDialogOptions) => Promise<void>
  }
  history: {
    list: () => Promise<readonly HistoryItem[]>
    copy: (id: string) => Promise<boolean>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: API
  }
}
