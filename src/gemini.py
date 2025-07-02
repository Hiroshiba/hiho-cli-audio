"""Gemini API連携モジュール"""

import tempfile
import wave
from pathlib import Path

import numpy as np
from google import genai

from .config import Config
from .types import CostInfo, TranscriptionResult


class GeminiClient:
    """Gemini API クライアント"""

    def __init__(self, config: Config):
        self.config = config.gemini
        self.client = genai.Client(api_key=self.config.api_key.get_secret_value())

    def transcribe(self, audio_data: np.ndarray) -> TranscriptionResult:
        """音声データをテキストに変換し、コスト情報も返す"""
        # 音声データを一時ファイルに保存
        temp_file_path = self._save_audio_to_temp_file(audio_data, 16000)

        try:
            # ファイルをアップロード
            uploaded_file = self.client.files.upload(file=temp_file_path)

            # フィーラー除去を含む日本語書き起こし用プロンプト
            prompt = """
以下の音声を書き起こしてください。フィーラー（「えー」「あの」「その」「まあ」などの間投詞）は除去し、内容の意味を損なわないようにしてください。
複数の話者がいる場合はSpeaker A、Speaker Bのように識別してください。
音楽や効果音がある場合は[MUSIC]や[SOUND]のように表記してください。
            """.strip()

            # 転写実行
            response = self.client.models.generate_content(
                model=self.config.model,
                contents=[prompt, uploaded_file],
            )

            # トークン使用量取得とコスト計算
            usage = response.usage_metadata
            cost_info = self._calculate_cost(usage)

            return TranscriptionResult(text=response.text, cost_info=cost_info)

        finally:
            # 一時ファイルを削除
            Path(temp_file_path).unlink(missing_ok=True)

    def _save_audio_to_temp_file(self, audio_data: np.ndarray, sample_rate: int) -> str:
        """NumPy配列をWAVファイルとして一時保存"""
        # 音声データをint16に変換
        audio_int16 = (audio_data * 32767).astype(np.int16)

        # 一時ファイルに保存
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
            with wave.open(temp_file.name, "wb") as wav_file:
                wav_file.setnchannels(1)  # モノラル
                wav_file.setsampwidth(2)  # 16bit
                wav_file.setframerate(sample_rate)
                wav_file.writeframes(audio_int16.tobytes())

            return temp_file.name

    def _calculate_cost(self, usage) -> CostInfo:
        """トークン使用量からコスト計算"""
        prompt_tokens = usage.prompt_token_count
        output_tokens = usage.candidates_token_count

        # Gemini 2.5 Pro の単価（USD / 1M tokens）
        input_price_per_million = 1.25  # プロンプト入力
        output_price_per_million = 10.00  # 出力

        cost_usd = (prompt_tokens / 1_000_000) * input_price_per_million + (
            output_tokens / 1_000_000
        ) * output_price_per_million

        return CostInfo(
            prompt_tokens=prompt_tokens,
            output_tokens=output_tokens,
            cost_usd=cost_usd,
        )
