# hiho-cli-audio

ホットキーで録音した音声をGemini APIで文字起こしし、クリップボードまたはHerdrへ送る常駐アプリです。WindowsとmacOSで使えます。

## インストール

[GitHub Releases](https://github.com/Hiroshiba/hiho-cli-audio/releases/latest)から、OSに合うファイルをダウンロードしてください。

- Windows: `hiho-cli-audio-<version>-setup.exe`
- macOS: `hiho-cli-audio-<version>.dmg`

Windowsではインストーラーを実行します。macOSではDMGを開き、hiho-cli-audioをアプリケーションフォルダへコピーします。

`main`の更新ごとに[`edge`リリース](https://github.com/Hiroshiba/hiho-cli-audio/releases/tag/edge)を通常リリースとして更新し、Latestに設定します。

### macOSでアプリを開けない場合

初回起動時に「hiho-cli-audio.appは壊れているため開けません」と表示された場合は、アプリをアプリケーションフォルダへ置いてから次のコマンドを実行してください。

```bash
xattr -dr com.apple.quarantine "/Applications/hiho-cli-audio.app"
```

## 初回起動後に設定ファイルを編集する

初回起動では設定ファイルが自動で作成されます。Gemini APIキーが未設定のためエラーが表示され、アプリは終了します。

1. OSに応じた設定ファイルを開く
   - Windows: `%APPDATA%\hiho-cli-audio\config.yaml`
   - macOS: `~/Library/Application Support/hiho-cli-audio/config.yaml`
2. `transcription.gemini.apiKey`にGemini APIキーを設定する
3. hiho-cli-audioを再起動する

設定の変更は再起動後に反映されます。APIキーは設定ファイルに平文で保存されるため、このファイルを共有しないでください。

<details>
<summary>設定例と主な項目を確認する</summary>

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
    model: 'gemini-3.5-transcribe'
  language: 'ja-JP'
  mode: 'verbatim'
  customVocabulary:
    - 'Gemini'

history:
  maxItems: 10

windows:
  status:
    initialPosition: 'top-right-offset'
  history:
    narrow: true
```

`transcription.mode`には、発話をそのまま残す`verbatim`か、読みやすく整える`smart`を指定します。`transcription.customVocabulary`には、認識を優先する固有名詞や専門用語を最大1000件指定できます。

設定項目が不足している場合や未対応の項目が含まれる場合は起動に失敗します。自動生成された設定ファイルを基に、必要な値だけを変更してください。

</details>

## ホットキーで録音する

起動後はWindowsの通知領域またはmacOSのメニューバーに常駐します。初回録音時にマイクの使用を求められたら許可してください。

初期ホットキーはWindowsが`Control+Shift+D`、macOSが`Command+Shift+D`です。ホットキーを押すと録音が始まり、もう一度押すと録音を終了して文字起こしを始めます。通常は認識結果がクリップボードに保存されます。

成功した認識結果はトレイメニューから履歴を開き、選択すると再びクリップボードへコピーできます。

macOSでホットキーが反応しない場合は、システム設定でhiho-cli-audioにアクセシビリティ権限を与えてください。

## Herdrへ入力する

設定ファイルに`herdr`を追加すると、録音開始時に対象のターミナルが前面にある場合だけ認識結果をHerdrへ送ります。`herdr`を設定しない場合は、常にクリップボードへ保存します。

<details>
<summary>Herdr連携の設定例と出力条件を確認する</summary>

### macOS

Herdr実行ファイルの絶対パスを指定します。

```yaml
herdr:
  macos:
    binaryPath: '/absolute/path/to/herdr'
```

iTerm2を前面にし、ウィンドウタイトルに`[HERDR]`を含めてから録音を始めます。前面状態の取得時にSystem Eventsの操作を求められた場合は、hiho-cli-audioに自動化を許可してください。

### Windows

使用するWSLの情報と、WSL内にあるHerdr実行ファイルのパスを指定します。

```yaml
herdr:
  windows:
    wslDistribution: '<WSLディストリビューション名>'
    wslUser: '<WSLユーザー名>'
    binaryPath: '<WSL内のHerdr実行ファイルのパス>'
```

Windows Terminalを前面にし、ウィンドウタイトルに`[HERDR]`を含めてから録音を始めます。対象タブを右クリックし、「タブ名の変更」で`[HERDR]`を含む名前にする方法があります。

### 出力先の決まり方

- 録音開始時に対象のターミナルと`[HERDR]`を確認できた場合は、その時点のHerdrペインへ送る
- 対象を確認できない場合はクリップボードへ保存する
- Herdrへの送信に失敗した場合は誤送信を避けるためクリップボードへ保存せず、失敗を表示する

</details>

## 開発

Node.js 22.14.0とpnpm 10.16.1を使用します。

```bash
pnpm install
pnpm dev
```

静的解析、型チェック、ビルドは次のコマンドで実行します。

```bash
pnpm lint
pnpm typecheck
pnpm build
```

OS別の配布物を作成する場合は、次のコマンドを使用します。

```bash
pnpm build:win
pnpm build:mac
```

詳しい仕様は[要件定義書](docs/要件定義書.md)を参照してください。

## ライセンス

ライセンスは[MIT License](LICENSE)です。
