"""型定義モジュール"""

from dataclasses import dataclass
from typing import Any, Literal

import numpy as np


@dataclass
class CostInfo:
    """コスト情報"""

    prompt_tokens: int
    output_tokens: int
    cost_usd: float


@dataclass
class TranscriptionResult:
    """音声認識結果"""

    text: str
    cost_info: CostInfo


RecordingResult = np.ndarray | Literal["MAX_DURATION_EXCEEDED"]


@dataclass
class AudioDeviceInfo:
    """オーディオデバイス情報"""

    name: str
    max_input_channels: int
    max_output_channels: int
    default_input: bool
    default_output: bool

    @classmethod
    def from_dict(
        cls, device_dict: dict[str, Any], is_default: bool
    ) -> "AudioDeviceInfo":
        """dictからAudioDeviceInfoを生成"""
        return cls(
            name=device_dict.get("name", "不明"),
            max_input_channels=device_dict.get("max_input_channels", 0),
            max_output_channels=device_dict.get("max_output_channels", 0),
            default_input=is_default and device_dict.get("max_input_channels", 0) > 0,
            default_output=is_default and device_dict.get("max_output_channels", 0) > 0,
        )
