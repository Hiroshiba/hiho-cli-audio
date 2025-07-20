import { ElectronAPI } from '@electron-toolkit/preload'
import type { AppError, ErrorDialogOptions } from '../shared/types/error'

interface API {
  error: {
    show: (error: AppError, options?: ErrorDialogOptions) => Promise<void>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: API
  }
}
