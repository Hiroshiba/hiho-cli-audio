import { ElectronAPI } from '@electron-toolkit/preload'
import type { HistoryListItem } from '../shared/types/history'
import type { StatusWindowState } from '../shared/types/status'

interface API {
  history: {
    list: () => Promise<readonly HistoryListItem[]>
    copy: (id: string) => Promise<boolean>
    retry: (id: string) => Promise<void>
    reveal: (id: string) => Promise<boolean>
    onUpdated: (callback: () => void) => () => void
  }
  status: {
    cancel: () => void
    getCurrent: () => Promise<StatusWindowState>
    onUpdate: (callback: (state: StatusWindowState) => void) => () => void
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: API
  }
}
