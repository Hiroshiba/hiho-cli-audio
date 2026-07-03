import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AppError, ErrorDialogOptions } from '../shared/types/error'
import type { HistoryItem } from '../shared/types/history'

// Custom APIs for renderer
const api = {
  error: {
    show: (error: AppError, options?: ErrorDialogOptions) =>
      ipcRenderer.invoke('error:show', error, options)
  },
  history: {
    list: async (): Promise<readonly HistoryItem[]> => await ipcRenderer.invoke('history:list'),
    copy: async (id: string): Promise<boolean> => {
      const copied = await ipcRenderer.invoke('history:copy', id)
      if (typeof copied !== 'boolean') {
        throw new Error('history:copy の戻り値が boolean ではありません')
      }

      return copied
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
