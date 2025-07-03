"""音声録音モジュール"""

import queue
import time
from collections.abc import Callable

import numpy as np
import sounddevice as sd
import typer

from .config import Config
from .types import RecordingResult


class AudioRecorder:
    """音声録音クラス"""

    def __init__(self, config: Config):
        self.config = config.audio
        self.audio_queue: queue.Queue[np.ndarray] = queue.Queue()

    def record_with_control(self, stop_flag_ref: Callable[[], bool]) -> RecordingResult:
        """停止フラグを参照しながらリアルタイム録音（最大時間制限付き）"""
        recorded_data: list[np.ndarray] = []
        start_time = time.time()

        def audio_callback(
            indata: np.ndarray, _frames: int, _time_info, status
        ) -> None:
            if status:
                typer.echo(f"Audio callback status: {status}")
            self.audio_queue.put(indata.copy())

        try:
            with sd.InputStream(
                samplerate=self.config.sample_rate,
                channels=self.config.channels,
                dtype=np.float32,
                callback=audio_callback,
                blocksize=int(self.config.sample_rate * 0.1),
            ):
                while not stop_flag_ref():
                    elapsed_time = time.time() - start_time
                    if elapsed_time >= self.config.max_duration:
                        typer.echo(
                            f"⏰ 最大録音時間（{self.config.max_duration}秒）に達しました。録音を強制終了します。"
                        )
                        return "MAX_DURATION_EXCEEDED"

                    try:
                        data = self.audio_queue.get(timeout=0.1)
                        recorded_data.append(data)
                    except queue.Empty:
                        continue

                while not self.audio_queue.empty():
                    try:
                        data = self.audio_queue.get_nowait()
                        recorded_data.append(data)
                    except queue.Empty:
                        break

        except Exception as e:
            typer.echo(f"Recording error: {e}")
            raise

        if not recorded_data:
            return np.array([], dtype=np.float32)

        combined_data = np.concatenate(recorded_data, axis=0)
        return combined_data.flatten()
