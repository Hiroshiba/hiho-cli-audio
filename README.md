# hiho-cli-audio

ホットキーで音声を文字起こししてクリップボードにコピーするElectronアプリケーションです。  
Gemini音声認識APIを利用してリアルタイム音声認識を行い、最前面表示でいつでもアクセスできます。

## 機能

- **ホットキー対応**: `Ctrl+Shift+D`（Windows/Linux）、`Cmd+Shift+D`（macOS）でワンタッチ録音
- **リアルタイム音声認識**: Gemini APIによる高精度な音声認識
- **最前面表示**: 常に最前面に表示されるため、どんなアプリケーションからでもアクセス可能
- **クリップボード連携**: 認識結果をワンクリックでクリップボードにコピー
- **クロスプラットフォーム**: Windows、macOS、Linux対応

## インストール・使用方法

### リリース版の使用（推奨）

[GitHub Releases](https://github.com/hiroshiba/hiho-cli-audio/releases)から最新版をダウンロードしてください。

### 開発版の使用

```bash
# 依存関係をインストール
pnpm install

# 開発モードで起動
pnpm dev
```

## 設定方法

### 1. 設定ファイルの作成

初回実行時に設定ファイルが自動作成されます：

`~/.config/hiho-cli-audio/config.yaml`

### 2. Gemini APIキーの設定

設定ファイルにGemini APIキーを設定してください：

```yaml
gemini_api_key: 'your-gemini-api-key-here'
hotkey: 'CommandOrControl+Shift+D'
```

## 使用方法

1. アプリケーションを起動
2. ホットキー（デフォルト: `Ctrl+Shift+D`）を押して録音開始
3. 再度ホットキーを押して録音停止・音声認識開始
4. 認識結果が表示されたら「コピー」ボタンでクリップボードにコピー

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
pnpm install
```

3. 開発環境での実行：

```bash
# 開発サーバー起動
pnpm dev

# 型チェック実行
pnpm typecheck

# ビルド実行
pnpm build
```

### コードフォーマット

Prettier・ESLintを使用してコードの品質を管理しています：

```bash
# リント実行
pnpm lint

# フォーマット実行
pnpm format

# 型チェック実行
pnpm typecheck
```

### ビルド

```bash
# Windows向けビルド
pnpm build:win

# macOS向けビルド
pnpm build:mac

# Linux向けビルド
pnpm build:linux
```

## ライセンス

MIT License - 詳細は [LICENSE](LICENSE) ファイルを参照してください。

## Note

このプロジェクトは開発者の個人利用を目的として開発されています。

## 作成者

@Hiroshiba
