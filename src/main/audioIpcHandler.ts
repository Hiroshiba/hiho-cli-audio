import { ipcMain, BrowserWindow } from 'electron'
import { AudioProcessor } from './audioProcessor'
import { GeminiService } from './geminiService'
import { RecordingData } from './types'

/** 音声関連のIPC通信ハンドラー */
export class AudioIpcHandler {
  private audioProcessor: AudioProcessor
  private geminiService: GeminiService

  constructor() {
    this.audioProcessor = new AudioProcessor()
    this.geminiService = GeminiService.getInstance()
    this.setupIpcHandlers()
  }

  /** IPC ハンドラーをセットアップ */
  private setupIpcHandlers(): void {
    ipcMain.on('recording:data', this.handleRecordingData.bind(this))
  }

  /** 録音データ受信ハンドラー */
  private async handleRecordingData(_event: Electron.IpcMainEvent, recordingData: RecordingData): Promise<void> {
    try {
      console.log('録音データを受信しました:', {
        audioDataLength: recordingData.audioData.length,
        sampleRate: recordingData.sampleRate,
        channels: recordingData.channels
      })

      const processResult = await this.audioProcessor.processAudioData(recordingData)
      if (!processResult.success) {
        console.error('音声処理エラー:', processResult.error)
        return
      }

      console.log('音声処理完了、音声認識開始')
      
      const geminiClient = this.geminiService.getClient()
      const transcriptionResult = await geminiClient.transcribe(
        processResult.data,
        16000
      )

      console.log('音声認識完了:', transcriptionResult)

      const mainWindow = BrowserWindow.getAllWindows()[0]
      if (mainWindow) {
        mainWindow.webContents.send('transcription:result', transcriptionResult)
      }

    } catch (error) {
      console.error('録音データ処理中にエラーが発生しました:', error)
    }
  }


  /** クリーンアップ */
  cleanup(): void {
    ipcMain.removeAllListeners('recording:data')
  }
}