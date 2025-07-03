"""Gemini音声認識APIを利用したCLIアプリケーション"""

import typer

from hiho_cli_audio.config import Config
from hiho_cli_audio.hotkey import HotkeyDaemon

app = typer.Typer(help="Gemini音声認識CLIアプリケーション")


@app.command()
def daemon():
    """デーモンモードでホットキー監視を開始"""
    config = Config.load()
    daemon = HotkeyDaemon(config)
    daemon.run_daemon()


@app.command()
def config():
    """設定ファイルの場所を表示（存在しない場合は作成）"""
    config_path = Config.get_config_path()
    
    if not config_path.exists():
        Config._create_default_config(config_path)
        typer.echo(f"設定ファイルを作成しました: {config_path}")
        typer.echo("Gemini APIキーを設定してください。")
    else:
        typer.echo(f"設定ファイル: {config_path}")


if __name__ == "__main__":
    app()
