"""ホットキー監視モジュール"""

import signal
import sys
import threading
import time

import pyperclip
import typer
from pynput import keyboard

from .audio import AudioRecorder
from .config import Config
from .gemini import GeminiClient


class HotkeyDaemon:
    """ホットキーデーモンクラス"""

    def __init__(self, config: Config) -> None:
        self.config: Config = config
        self.recording: bool = False
        self.running: bool = True
        self.recorder: AudioRecorder = AudioRecorder(config)
        self.client: GeminiClient = GeminiClient(config)
        self.hotkeys: keyboard.GlobalHotKeys | None = None
        self.record_thread: threading.Thread | None = None

        self._setup_signal_handlers()

    def _setup_signal_handlers(self) -> None:
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)

    def _signal_handler(self, signum: int, frame: object) -> None:
        typer.echo(f"\n📡 シグナル {signum} を受信しました。終了します。")
        self.stop_daemon()

    def toggle_recording(self) -> None:
        """録音状態を切り替え"""
        if not self.recording:
            self._start_recording()
        else:
            self._stop_recording()

    def _start_recording(self) -> None:
        if self.recording:
            typer.echo("⚠️  録音は既に実行中です")
            return

        self.recording = True

        self.record_thread = threading.Thread(
            target=self._record_and_transcribe, daemon=True
        )
        self.record_thread.start()
        typer.echo("🎤 音声録音を開始しました")

    def _stop_recording(self) -> None:
        if not self.recording:
            return

        self.recording = False
        typer.echo("⏹️  音声録音を停止しました")

    def _record_and_transcribe(self) -> None:
        try:
            audio_data = self.recorder.record_with_control(lambda: not self.recording)

            self.recording = False

            typer.echo("🔄 音声認識中...")

            result = self.client.transcribe(audio_data)

            typer.echo(f"📝 認識結果: {result.text}")

            # クリップボードにコピー
            pyperclip.copy(result.text)
            typer.echo("📋 クリップボードにコピーしました")

            cost = result.cost_info
            typer.echo("💰 === コスト情報 ===")
            typer.echo(f"   プロンプト使用トークン: {cost.prompt_tokens} トークン")
            typer.echo(f"   出力使用トークン: {cost.output_tokens} トークン")
            typer.echo(f"   推定コスト: ${cost.cost_usd:.6f} USD")

        except Exception as e:
            self.recording = False
            typer.echo(f"❌ 録音・認識中にエラーが発生しました: {e}")

    def _setup_hotkeys(self) -> keyboard.GlobalHotKeys:
        return keyboard.GlobalHotKeys(
            {self.config.hotkey.record_toggle: self.toggle_recording}
        )

    def run_daemon(self) -> None:
        """デーモンプロセスとして実行"""
        typer.echo("🎙️  音声録音CLIデーモンが開始されました")
        typer.echo("\n📌 ショートカットキー:")
        typer.echo(f"   {self.config.hotkey.record_toggle}: 録音開始/停止")
        typer.echo("   Ctrl+C: デーモン終了")
        typer.echo("\n⏳ ホットキー待機中...")

        try:
            self.hotkeys = self._setup_hotkeys()
            self.hotkeys.__enter__()

            while self.running:
                time.sleep(0.3)

        except KeyboardInterrupt:
            typer.echo("\n👋 キーボード割り込みを受信しました")
        except Exception as e:
            typer.echo(f"❌ ホットキー監視中にエラーが発生しました: {e}")
        finally:
            self.stop_daemon()

    def stop_daemon(self) -> None:
        """デーモンプロセスを停止"""
        self.running = False

        if self.recording:
            self.recording = False

        if self.hotkeys:
            try:
                self.hotkeys.__exit__(None, None, None)
            except Exception:
                pass

        typer.echo("🛑 デーモンを停止しました")
        sys.exit(0)
