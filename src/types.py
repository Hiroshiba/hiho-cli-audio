"""型定義モジュール"""

from dataclasses import dataclass


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
