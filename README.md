# hiho-cli-audio

ホットキーで音声を文字起こししてクリップボードにコピーするCLIアプリケーションです。  
Geminiを利用して音声認識を行います。


## インストール・使用方法

事前に[uv](https://docs.astral.sh/uv/)をインストールしてください。

### uvxを使用した実行（推奨）

```bash
# デーモンモードでホットキー監視開始
uvx git+https://github.com/Hiroshiba/hiho-cli-audio daemon

# 設定ファイルの場所を表示
uvx git+https://github.com/Hiroshiba/hiho-cli-audio config

# ヘルプを表示
uvx git+https://github.com/Hiroshiba/hiho-cli-audio --help
```

## 設定方法

### 1. 設定ファイルの作成

初回実行時に設定ファイルが自動作成されます：

```bash
uvx git+https://github.com/Hiroshiba/hiho-cli-audio config
```

### 2. Gemini APIキーの設定

`~/.config/hiho-cli-audio/config.yaml` にGemini APIキーを設定してください：

```yaml
gemini_api_key: "your-gemini-api-key-here"
```



## 開発環境

このプロジェクトは**Claude Code**（claude.ai/code）を使用して開発されています。

### 環境構築

1. リポジトリをクローン：
```bash
git clone https://github.com/hiroshiba/hiho-cli-audio.git
cd hiho-cli-audio
```

2. 依存関係をインストール：
```bash
uv sync
```

3. 開発環境での実行：
```bash
# モジュール形式で実行
uv run python -m hiho_cli_audio.main --help
uv run python -m hiho_cli_audio.main daemon
uv run python -m hiho_cli_audio.main config
```

### コードフォーマット

Ruffを使用してコードの品質を管理しています：

```bash
# リント実行
uv run ruff check .

# フォーマット実行
uv run ruff format .

# 自動修正
uv run ruff check --fix .
```


## ライセンス

MIT License - 詳細は [LICENSE](LICENSE) ファイルを参照してください。

## Note

このプロジェクトは開発者の個人利用を目的として開発されています。

## 作成者

@Hiroshiba