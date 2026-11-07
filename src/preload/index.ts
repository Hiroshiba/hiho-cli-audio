import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { z } from 'zod'
import type { HistoryListItem } from '../shared/types/history'
import type { StatusWindowState } from '../shared/types/status'

z.config({ jitless: true })

const StatusWindowStateSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('idle'),
      processingJobCount: z.number().int().nonnegative()
    })
    .strict(),
  z
    .object({
      kind: z.literal('recording'),
      recordingStartedAt: z.string().min(1),
      processingJobCount: z.number().int().nonnegative(),
      inputWarning: z.boolean(),
      target: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('pending') }).strict(),
        z.object({ kind: z.literal('clipboard') }).strict(),
        z
          .object({
            kind: z.literal('herdr'),
            paneId: z.string().min(1)
          })
          .strict()
      ])
    })
    .strict(),
  z
    .object({
      kind: z.literal('transcribing'),
      processingJobCount: z.number().int().nonnegative()
    })
    .strict(),
  z
    .object({
      kind: z.literal('completed'),
      message: z.string().min(1),
      processingJobCount: z.number().int().nonnegative()
    })
    .strict(),
  z
    .object({
      kind: z.literal('failed'),
      message: z.string().min(1),
      processingJobCount: z.number().int().nonnegative()
    })
    .strict()
])

const HistoryListItemSchema = z
  .object({
    id: z.string().min(1),
    createdAt: z.string().min(1),
    completedAt: z.string().min(1),
    status: z.enum(['completed', 'failed']),
    transcript: z.string(),
    preview: z.string(),
    audioPath: z.string().min(1).nullable(),
    audioAvailable: z.boolean(),
    retrying: z.boolean()
  })
  .strict()

// Custom APIs for renderer
const api = {
  history: {
    list: async (): Promise<readonly HistoryListItem[]> => {
      const items: unknown = await ipcRenderer.invoke('history:list')
      return z.array(HistoryListItemSchema).parse(items)
    },
    copy: async (id: string): Promise<boolean> => {
      const copied = await ipcRenderer.invoke('history:copy', id)
      if (typeof copied !== 'boolean') {
        throw new Error('history:copy の戻り値が boolean ではありません')
      }

      return copied
    },
    retry: async (id: string): Promise<void> => {
      await ipcRenderer.invoke('history:retry', id)
    },
    reveal: async (id: string): Promise<boolean> => {
      const revealed: unknown = await ipcRenderer.invoke('history:reveal', id)
      return z.boolean().parse(revealed)
    },
    onUpdated: (callback: () => void): (() => void) => {
      const listener = (): void => {
        callback()
      }

      ipcRenderer.on('history:updated', listener)

      return () => {
        ipcRenderer.removeListener('history:updated', listener)
      }
    }
  },
  status: {
    cancel: (): void => {
      ipcRenderer.send('status:cancel')
    },
    getCurrent: async (): Promise<StatusWindowState> => {
      const state: unknown = await ipcRenderer.invoke('status:get')
      return StatusWindowStateSchema.parse(state)
    },
    onUpdate: (callback: (state: StatusWindowState) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, state: unknown): void => {
        callback(StatusWindowStateSchema.parse(state))
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
