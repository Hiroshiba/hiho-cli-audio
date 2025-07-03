"""型定義モジュール"""

from dataclasses import dataclass
from typing import Literal

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
