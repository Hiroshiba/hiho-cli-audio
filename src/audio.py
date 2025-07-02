"""音声録音モジュール"""

import numpy as np
import sounddevice as sd

from .config import Config


class AudioRecorder:
    """音声録音クラス"""

    def __init__(self, config: Config):
        self.config = config.audio

    def record(self) -> np.ndarray:
        """音声を録音"""
        record_duration = self.config.duration

        audio_data = sd.rec(
            frames=record_duration * self.config.sample_rate,
            samplerate=self.config.sample_rate,
            channels=self.config.channels,
            dtype=np.float32,
        )

        sd.wait()  # 録音完了まで待機
        return audio_data.flatten()

    def get_available_devices(self) -> sd.DeviceList | dict:
        """利用可能な音声デバイス一覧を取得"""
        return sd.query_devices()
