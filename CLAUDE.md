# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

このプロジェクトは、Gemini音声認識APIを利用したMac/Windows対応のCLIアプリケーションです。ショートカットキーで起動し、マイク音声を文字起こししてクリップボードにコピーする機能を提供します。

## 開発環境とツール

### パッケージ管理
- **uv**: Rust製の次世代Pythonパッケージマネージャーを使用
  - 仮想環境の作成とパッケージ管理を一元化
  - `uv sync` でプロジェクトの依存関係をインストール
  - `uv run python script.py` でスクリプトを実行

### 必須ライブラリ
- **Typer**: CLIアプリケーションフレームワーク
  - コマンドライン引数とサブコマンドの処理
  - 型ヒント対応の自動的なヘルプ生成
  - プログレスバー表示機能
- **Pydantic**: データバリデーションとシリアライゼーション
  - 設定ファイルの読み込みとバリデーション
  - API レスポンスのパース
  - 型安全なデータモデル定義
- **httpx**: 高速HTTP クライアント（Gemini API 連携）
- **sounddevice**: 音声録音・再生ライブラリ
- **pyperclip**: クリップボード操作ライブラリ
- **pyyaml**: YAML設定ファイル読み込み
- **pynput**: キーボード・マウス入力監視（ショートカットキー）
- **numpy**: 音声データ処理

## アーキテクチャ設計指針

### 設定管理
- 設定ファイルは `~/.config/hiho-cli-audio/config.yaml` に配置
- Pydanticモデルで設定値をバリデーション
- API キーなどの機密情報は環境変数ではなく設定ファイルで管理

### 音声処理フロー
1. ショートカットキー検知によるトリガー
2. マイク音声の収集
3. Gemini API への音声データ送信
4. 認識結果のクリップボードへのコピー
5. トークン使用量のログ出力

### エラー処理戦略
- 想定外の挙動では例外を投げる
- フォールバック処理は極力避ける
- ネットワークエラーやAPI キー関連のエラーはターミナルに表示してデーモンを継続

## コーディング規約

### Python固有の規約
- Python 3.11対応コードで記述
- Python 3.9+の組み込み型を使用（`typing.List` → `list`, `typing.Dict` → `dict`, `typing.Tuple` → `tuple`, `typing.Set` → `set`）
- Python 3.10+のUnion型記法を使用（`typing.Union[str, None]` → `str | None`, `typing.Optional[str]` → `str | None`）
- `os.path` ではなく `pathlib.Path` を使用
- `Path.open()` ではなく `Path.read_text()` / `Path.read_bytes()` を使用（ファイル読み書きは可能な限り`Path`のメソッドを使用）

### 一般的な規約
- 関数・クラスには1行のdocstringを記述
- 変数名・関数名から自明なコメントは書かない
- 関数の引数にはデフォルト値を設定しない（設定ファイルのデフォルト値は例外）
- 型ヒントを必須とする
- **型サポートを極力活用する**
  - `dict`や`list`などの抽象的な型を避け、具体的な型を使用
  - 戻り値には`dict`ではなくデータクラスやPydanticモデルを使用
  - 型安全性を最大限に活用してバグを防止
- null・空文字・-1に特別な意味を持たせない
- **コメントは必ず日本語で記述する**（pyproject.tomlの設定コメント含む）

### セキュリティ
- API キーやクレデンシャル情報をコードに埋め込まない
- 設定ファイルは適切なパーミッションで保護
- **PydanticのSecretStr**を使用してAPIキーをログ・エラーメッセージから保護
  - print()やログ出力時に自動的に「**********」でマスク
  - 実際の値は`.get_secret_value()`で取得

### ⚠️ 重要な制約事項 ⚠️
**🚨 設定ファイルを読み取り禁止 🚨**
- **絶対に設定ファイル（~/.config/hiho-cli-audio/config.yaml）の内容を読み取らない**
- **APIキーなど機密情報の流出防止のための徹底ルール**
- **他のセッションでも必ずこのルールを遵守すること**

### 詳細な規約とドキュメント
- **詳細なコーディング規約**: `docs/コーディング規約.md` を参照（必要な時に確認）
- **プロジェクト要件定義**: `docs/要件定義書.md` を参照（機能要件と非機能要件の詳細）

### コミットメッセージ規約
**Conventional Commits** を使用してコミットメッセージを記述する：

形式: `<type>[optional scope]: <description>`

主要なtype:
- `feat:` 新機能
- `fix:` バグ修正  
- `docs:` ドキュメントのみの変更
- `style:` コードの意味に影響しない変更（フォーマット、空白など）
- `refactor:` バグ修正や機能追加を行わないコード変更
- `perf:` パフォーマンス向上
- `test:` テスト追加・修正
- `chore:` ビルドプロセスや補助ツールの変更

**コミットメッセージは日本語で記述する**

例: `feat(auth): ユーザー認証機能を追加`, `docs: API仕様書を更新`

## 外部システム連携

### OS統合
- クリップボード操作: 各OSの標準API使用
- ショートカットキー: OS標準機能またはユーティリティで設定
- デーモン化: バックグラウンドプロセスとして常駐

### API統合
- Gemini音声認識API
- 入力/出力トークン数の記録
- レート制限とエラーハンドリング

## ログとモニタリング

- 標準出力/標準エラー出力を使用
- 処理開始/完了のタイムスタンプ
- トークン使用量の記録
- エラー発生時の詳細情報

## プロジェクト構造

```
hiho-cli-audio/
├── main.py                 # CLIエントリーポイント
├── src/
│   ├── __init__.py
│   ├── config.py          # 設定ファイル管理
│   ├── audio.py           # 音声録音機能
│   ├── gemini.py          # Gemini API連携
│   └── types.py           # 型定義
├── pyproject.toml         # プロジェクト設定
├── .python-version        # Python 3.11指定
└── uv.lock               # 依存関係ロック
```

## 開発時の注意点

- 単一ユーザー用途での設計（設定ファイルはホームディレクトリ配下）
- 起動から待機状態まで5秒以内のパフォーマンス要件  
- macOS（最新2バージョン）とWindows 10/11の両対応が必要

## 実行方法

### 開発環境セットアップ
```bash
# 依存関係インストール
uv sync

# アプリケーション実行
uv run python main.py --help
uv run python main.py record
```

### 開発ツール

#### Ruff（コードフォーマッター・リンター）
- VOICEVOX Engineの設定をベースに採用
- Python 3.11対応、日本語docstring対応
```bash
# リント実行
uv run ruff check .

# フォーマット実行  
uv run ruff format .

# 自動修正
uv run ruff check --fix .
```