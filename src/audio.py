"""音声録音モジュール"""

import queue
import time
from collections.abc import Callable

import numpy as np
import sounddevice as sd
import typer

from .config import Config
from .types import AudioDeviceInfo, RecordingResult


def get_audio_devices() -> list[AudioDeviceInfo]:
    """利用可能なオーディオデバイス情報を取得"""
    devices_info: list[AudioDeviceInfo] = []
    try:
        devices = sd.query_devices()

        default_input_name = ""
        try:
            default_input = sd.query_devices(kind="input")
            default_input_name = default_input.get("name", "")
        except Exception:
            pass

        for dev in devices:
            is_default = dev.get("name", "") == default_input_name
            device_info = AudioDeviceInfo.from_dict(dev, is_default)
            devices_info.append(device_info)

    except Exception as e:
        typer.echo(f"オーディオデバイス情報の取得に失敗: {e}")

    return devices_info


def print_audio_devices() -> None:
    """利用可能なオーディオデバイス情報を表示"""
    devices_info = get_audio_devices()

    typer.echo("\n🎧 利用可能なオーディオデバイス:")
    for i, dev in enumerate(devices_info):
        device_type = "🎤" if dev.max_input_channels > 0 else "🔈"
        if dev.max_input_channels > 0 and dev.max_output_channels > 0:
            device_type = "🎧"
        default_mark = "[デフォルト]" if dev.default_input else ""
        typer.echo(
            f"   {device_type} {i}: {dev.name} {default_mark} (入力: {dev.max_input_channels}ch, 出力: {dev.max_output_channels}ch)"
        )

    default_devices = [dev for dev in devices_info if dev.default_input]
    if default_devices:
        typer.echo(f"\n🎤 デフォルト入力デバイス: {default_devices[0].name}")
    else:
        typer.echo("\n⚠️ デフォルト入力デバイスが見つかりません")


class AudioRecorder:
    """音声録音クラス"""

    def __init__(self, config: Config):
        self.config = config.audio
        self.audio_queue: queue.Queue[np.ndarray] = queue.Queue()
        self.input_device: AudioDeviceInfo | None = None

    def get_input_device_info(self) -> AudioDeviceInfo:
        """入力デバイス情報を取得"""
        try:
            device_dict = sd.query_devices(kind="input")
            return AudioDeviceInfo.from_dict(device_dict, True)
        except Exception as e:
            typer.echo(f"入力デバイス情報の取得に失敗: {e}")
            return AudioDeviceInfo(
                name="不明",
                max_input_channels=0,
                max_output_channels=0,
                default_input=False,
                default_output=False,
            )

    def record_with_control(self, stop_flag_ref: Callable[[], bool]) -> RecordingResult:
        """停止フラグを参照しながらリアルタイム録音（最大時間制限付き）"""
        recorded_data: list[np.ndarray] = []
        start_time = time.time()

        try:
            self.input_device = self.get_input_device_info()
            typer.echo(f"\n🎤 使用中の入力デバイス: {self.input_device.name}")
        except Exception:
            pass

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
            typer.echo("録音データが取得されませんでした")
            return np.array([], dtype=np.float32)

        try:
            if len(recorded_data) == 1:
                return recorded_data[0].flatten()
            else:
                combined_data = np.concatenate(recorded_data, axis=0)
                return combined_data.flatten()
        except ValueError as e:
            typer.echo(f"音声データの結合中にエラーが発生しました: {e}")
            if recorded_data:
                return recorded_data[0].flatten()
            return np.array([], dtype=np.float32)
        except Exception as e:
            typer.echo(f"音声データの処理中に予期せぬエラーが発生しました: {e}")
            return np.array([], dtype=np.float32)
