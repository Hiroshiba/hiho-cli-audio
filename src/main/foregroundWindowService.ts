import { z } from 'zod'
import { execFileText } from './execFileText'

const HERDR_WINDOW_MARKER = '[HERDR]'
const MACOS_FOREGROUND_SCRIPT = `
const systemEvents = Application('System Events')
const frontProcess = systemEvents.applicationProcesses.whose({ frontmost: true })[0]
const processName = frontProcess.name()
const windows = frontProcess.windows()
const windowTitle = windows.length > 0 ? windows[0].name() : ''
JSON.stringify({ processName, windowTitle })
`
const WINDOWS_FOREGROUND_SCRIPT = `
$source = @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class HihoForegroundWindowNativeMethods {
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll", SetLastError = true)]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@
Add-Type -TypeDefinition $source
$windowHandle = [HihoForegroundWindowNativeMethods]::GetForegroundWindow()
$windowTitleBuffer = New-Object System.Text.StringBuilder 1024
[void][HihoForegroundWindowNativeMethods]::GetWindowText($windowHandle, $windowTitleBuffer, $windowTitleBuffer.Capacity)
$processId = 0
[void][HihoForegroundWindowNativeMethods]::GetWindowThreadProcessId($windowHandle, [ref]$processId)
$process = Get-Process -Id $processId
[pscustomobject]@{
  processName = $process.ProcessName
  windowTitle = $windowTitleBuffer.ToString()
} | ConvertTo-Json -Compress
`

const ForegroundWindowSchema = z
  .object({
    processName: z.string(),
    windowTitle: z.string()
  })
  .passthrough()

/** Herdr前面判定の共通インターフェース */
export interface HerdrForegroundDetector {
  /** 前面ウィンドウがHerdr用ターミナルか判定 */
  isHerdrForeground(signal: AbortSignal): Promise<boolean>
}

function parseForegroundWindow(stdout: string): { processName: string; windowTitle: string } {
  return ForegroundWindowSchema.parse(JSON.parse(stdout))
}

/** macOSの前面ウィンドウを判定 */
export class MacosHerdrForegroundDetector implements HerdrForegroundDetector {
  /** 前面ウィンドウがHerdr用iTerm2か判定 */
  async isHerdrForeground(signal: AbortSignal): Promise<boolean> {
    const stdout = await execFileText(
      '/usr/bin/osascript',
      ['-l', 'JavaScript', '-e', MACOS_FOREGROUND_SCRIPT],
      signal
    )
    const foregroundWindow = parseForegroundWindow(stdout)
    return (
      foregroundWindow.processName === 'iTerm2' &&
      foregroundWindow.windowTitle.includes(HERDR_WINDOW_MARKER)
    )
  }
}

/** Windowsの前面ウィンドウを判定 */
export class WindowsHerdrForegroundDetector implements HerdrForegroundDetector {
  /** 前面ウィンドウがHerdr用Windows Terminalか判定 */
  async isHerdrForeground(signal: AbortSignal): Promise<boolean> {
    const stdout = await execFileText(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_FOREGROUND_SCRIPT],
      signal
    )
    const foregroundWindow = parseForegroundWindow(stdout)
    const isWindowsTerminal =
      foregroundWindow.processName === 'WindowsTerminal' ||
      foregroundWindow.processName === 'WindowsTerminal.exe'
    return isWindowsTerminal && foregroundWindow.windowTitle.includes(HERDR_WINDOW_MARKER)
  }
}
