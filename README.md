# hiho-cli-audio

ホットキーで録音し、Gemini APIで文字起こしした結果を自動でクリップボードへコピーする個人用Electronアプリケーションです。

## 機能

- Windows通知領域とmacOSメニューバーに常駐
- グローバルホットキーで録音開始と停止を切り替え
- 録音停止後にWebMを16kHzモノラルWAVへ変換
- Gemini APIで文字起こしし、完了順にクリップボードへコピー
- 録音中、認識中、完了、失敗だけを小型状態ウィンドウに表示
- トレイメニューから履歴ウィンドウを開き、成功した履歴をクリックで再コピー
- 設定はアプリ内画面ではなくYAMLファイルを直接編集

## 対応OS

- Windows
- macOS

Linux向けビルドは提供しません。

## macOS版の初回起動

初回起動時に「hiho-cli-audio.appは壊れているため開けません」と表示された場合は、次のコマンドを実行してください。

```bash
xattr -dr com.apple.quarantine "/Applications/hiho-cli-audio.app"
```

## 使い方

1. アプリケーションを起動する
2. 初回起動で作成された `config.yaml` にGemini APIキーを設定する
3. アプリケーションを再起動する
4. ホットキーで録音を開始する
5. もう一度ホットキーを押して録音を停止する
6. 文字起こし完了後、結果が自動でクリップボードへコピーされる

初期ホットキーはWindowsが `Ctrl+Shift+D`、macOSが `Command+Shift+D` です。

## 設定ファイル

設定ファイルはElectronのユーザーデータディレクトリに作成されます。

- Windows: `%APPDATA%/hiho-cli-audio/config.yaml`
- macOS: `~/Library/Application Support/hiho-cli-audio/config.yaml`

設定例です。

```yaml
app:
  alwaysOnTop: true

hotkeys:
  toggleRecording:
    windows: 'Control+Shift+D'
    macos: 'Command+Shift+D'

recording:
  autoStopSeconds: 300

transcription:
  provider: 'gemini'
  gemini:
    apiKey: 'your-gemini-api-key'
    model: 'gemini-2.5-flash'
  language: 'ja-JP'

history:
  maxItems: 10

windows:
  status:
    initialPosition: 'top-right-offset'
  history:
    narrow: true

vocabulary:
  - reading: 'じぇみに'
    output: 'Gemini'
```

設定の変更はアプリケーション再起動後に反映されます。

## 開発

```bash
pnpm install
pnpm dev
```

確認コマンドです。

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## ビルド

```bash
pnpm build:win
pnpm build:mac
```

GitHub Actionsの `Release` ワークフローはインストーラーを作成し、指定したバージョンのGitHub Releaseへアップロードします。自動更新、署名、公証は行いません。

## ライセンス

MIT Licenseです。詳細は [LICENSE](LICENSE) を参照してください。
