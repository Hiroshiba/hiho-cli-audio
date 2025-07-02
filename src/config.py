"""設定ファイル管理モジュール"""

from pathlib import Path

import yaml
from pydantic import BaseModel, Field, SecretStr


class AudioConfig(BaseModel):
    """音声録音設定"""

    sample_rate: int = Field(default=16000, description="サンプリングレート")
    channels: int = Field(default=1, description="チャンネル数")
    duration: int = Field(default=10, description="録音時間（秒）")


class GeminiConfig(BaseModel):
    """Gemini API設定"""

    api_key: SecretStr = Field(description="Gemini APIキー")
    model: str = Field(default="gemini-pro", description="使用モデル")

    def __init__(self, **data):
        # NOTE: APIキーの前後の空白を除去（画面表示対策で長い空白を入れる場合への対応）
        if "api_key" in data:
            data["api_key"] = data["api_key"].strip()
        super().__init__(**data)


class Config(BaseModel):
    """アプリケーション設定"""

    audio: AudioConfig = Field(default_factory=AudioConfig)
    gemini: GeminiConfig

    @classmethod
    def get_config_path(cls) -> Path:
        """設定ファイルのパスを取得"""
        config_dir = Path.home() / ".config" / "hiho-cli-audio"
        return config_dir / "config.yaml"

    @classmethod
    def load(cls) -> "Config":
        """設定ファイルを読み込み"""
        config_path = cls.get_config_path()

        if not config_path.exists():
            cls._create_default_config(config_path)
            raise FileNotFoundError(
                f"設定ファイルが見つかりません: {config_path}\n"
                "デフォルト設定ファイルを作成しました。API キーを設定してください。"
            )

        data = yaml.safe_load(config_path.read_text(encoding="utf-8"))

        return cls(**data)

    @classmethod
    def _create_default_config(cls, config_path: Path) -> None:
        """デフォルト設定ファイルを作成"""
        config_path.parent.mkdir(parents=True, exist_ok=True)

        # NOTE: 型サポートを受けるためにPydanticモデルを使用してデフォルト設定を作成
        default_audio = AudioConfig()
        default_gemini = {
            "api_key": "YOUR_GEMINI_API_KEY_HERE",
            "model": "gemini-2.5-pro",
        }

        default_config = {
            "audio": default_audio.model_dump(),
            "gemini": default_gemini,
        }

        with open(config_path, "w", encoding="utf-8") as f:
            yaml.dump(default_config, f, default_flow_style=False, allow_unicode=True)
