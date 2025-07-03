"""Gemini音声認識APIを利用したCLIアプリケーション"""

import typer

from src.audio import AudioRecorder
from src.config import Config
from src.gemini import GeminiClient
from src.hotkey import HotkeyDaemon

app = typer.Typer(help="Gemini音声認識CLIアプリケーション")


@app.command()
def record():
    """音声を録音してテキストに変換"""
    config = Config.load()
    recorder = AudioRecorder(config)
    client = GeminiClient(config)

    typer.echo("音声録音を開始します...")
    audio_data = recorder.record()

    typer.echo("音声認識中...")
    result = client.transcribe(audio_data)

    typer.echo(f"認識結果: {result.text}")

    # コスト情報を表示
    cost = result.cost_info
    typer.echo("\n=== コスト情報 ===")
    typer.echo(f"プロンプト使用トークン: {cost.prompt_tokens} トークン")
    typer.echo(f"出力使用トークン: {cost.output_tokens} トークン")
    typer.echo(f"推定コスト: ${cost.cost_usd:.6f} USD")


@app.command()
def daemon():
    """デーモンモードでホットキー監視を開始"""
    config = Config.load()
    daemon = HotkeyDaemon(config)
    daemon.run_daemon()


@app.command()
def config():
    """設定ファイルの場所を表示"""
    config_path = Config.get_config_path()
    typer.echo(f"設定ファイル: {config_path}")


if __name__ == "__main__":
    app()
