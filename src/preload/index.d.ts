import { ElectronAPI } from '@electron-toolkit/preload'
import type { AppError, ErrorDialogOptions } from '../shared/types/error'
import type { HistoryItem } from '../shared/types/history'
import type { StatusWindowState } from '../shared/types/status'

interface API {
  error: {
    show: (error: AppError, options?: ErrorDialogOptions) => Promise<void>
  }
  history: {
    list: () => Promise<readonly HistoryItem[]>
    copy: (id: string) => Promise<boolean>
  }
  status: {
    onUpdate: (callback: (state: StatusWindowState) => void) => () => void
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: API
  }
}
