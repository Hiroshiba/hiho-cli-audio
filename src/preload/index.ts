import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { HistoryItem } from '../shared/types/history'
import type { StatusWindowState } from '../shared/types/status'

// Custom APIs for renderer
const api = {
  history: {
    list: async (): Promise<readonly HistoryItem[]> => await ipcRenderer.invoke('history:list'),
    copy: async (id: string): Promise<boolean> => {
      const copied = await ipcRenderer.invoke('history:copy', id)
      if (typeof copied !== 'boolean') {
        throw new Error('history:copy の戻り値が boolean ではありません')
      }

      return copied
    }
  },
  status: {
    onUpdate: (callback: (state: StatusWindowState) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, state: StatusWindowState): void => {
        callback(state)
      }

      ipcRenderer.on('status:update', listener)

      return () => {
        ipcRenderer.removeListener('status:update', listener)
      }
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
