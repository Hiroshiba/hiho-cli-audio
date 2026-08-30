# hiho-cli-audio

ホットキーで録音し、Gemini APIで文字起こしした結果を出力先に応じてクリップボードまたはHerdrへ送る個人用Electronアプリケーションです。

## 機能

- Windows通知領域とmacOSメニューバーに常駐
- グローバルホットキーで録音開始と停止を切り替え
- 録音停止後にWebMを16kHzモノラルWAVへ変換
- Gemini APIで文字起こしし、完了順に設定した出力先へ送信
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
6. 文字起こし完了後、設定と前面状態に応じた出力先へ結果が送られる

初期ホットキーはWindowsが `Ctrl+Shift+D`、macOSが `Command+Shift+D` です。

## 設定ファイル

設定ファイルはElectronのユーザーデータディレクトリに作成されます。

- Windows: `%APPDATA%\hiho-cli-audio\config.yaml`
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

設定の変更はアプリケーション再起動後に反映されます。

`transcription.mode` は発話をそのまま残す `verbatim` または読みやすく整える `smart` を指定します。
`transcription.customVocabulary` には認識時に優先する固有名詞や専門用語を最大1000件指定できます。

## Herdrへの入力

`herdr` はhiho-cli-audioの `config.yaml` に置くトップレベル設定です。設定全体は任意で、設定しない場合は認識結果をクリップボードだけへ保存します。

macOS では次のように Herdr 実行ファイルのパスを指定します。

```yaml
herdr:
  macos:
    binaryPath: '/absolute/path/to/herdr'
```

iTerm2 が前面にあり、ウィンドウタイトルに `[HERDR]` が含まれる場合だけ Herdr への入力対象になります。macOS が自動化やアクセシビリティの許可を求めた場合は、システム設定のプライバシーとセキュリティで hiho-cli-audio に System Events の操作を許可してください。

Windows では WSL の値と WSL 内の Herdr 実行ファイルのパスを指定します。

```yaml
herdr:
  windows:
    wslDistribution: '<WSLディストリビューション名>'
    wslUser: '<WSLユーザー名>'
    binaryPath: '<WSL内のHerdr実行ファイルのパス>'
```

Windows Terminal が前面にあり、ウィンドウタイトルに `[HERDR]` が含まれる場合だけ Herdr への入力対象になります。Windows Terminal では対象タブを右クリックし、タブ名の変更で `[HERDR] Herdr` などにしてください。この手順は実機で確認済みです。macOS と Windows のどちらも、タイトルにマーカーがない場合はクリップボードへだけ出力します。

Herdr の `[ui] window_title` は自動化したい場合の候補です。次の設定例は Herdr のバージョンに依存します。

```toml
[ui]
window_title = "[HERDR] {workspace} — {tab}"
```

Herdr 0.8.0 での設定項目は未確認です。インストール済みの Herdr で `herdr --help` と設定仕様を確認してください。これは確定した設定手順ではありません。タイトルに `[HERDR]` を設定できない環境では判定条件を満たさず、誤送信を防ぐためクリップボードへ出力します。

録音開始時に前面状態を判定し、Herdr target になった場合は現在の Herdr pane を取得して送信先を固定します。録音中に別の pane や別のアプリケーションへ移動しても、開始時の pane へ送信します。clipboard target の場合だけ認識原文をクリップボードへ保存します。Herdr target では改行を空白に置き換えた文字列を `pane run` でEnter付きで送信し、入力を開始します。成功時はクリップボードを変更しません。前面判定または pane 取得に失敗した場合はクリップボードへ出力します。Herdr 送信に失敗した場合はクリップボードへフォールバックせず、別の pane にも送らず、認識原文を成功履歴へ保存したうえで状態ウィンドウに失敗を表示します。

動作確認では、設定した環境で次を確認してください。

- macOS は `<Herdr実行ファイルのパス> pane current` が JSON を返すこと
- Windows は `wsl.exe -d "<WSLディストリビューション名>" -u "<WSLユーザー名>" -- "<WSL内のHerdr実行ファイルのパス>" pane current` が動くこと
- Herdr の端末タイトルに `[HERDR]` が表示されること
- Herdr 送信前にクリップボードへ任意の識別文字列を入れ、送信後も内容が変わらないこと
- 成功表示が `Herdrへ入力しました` になること
- 設定後にアプリケーションを再起動すること

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

### GitHub Actionsのバージョン固定

[pinact](https://github.com/suzuki-shunsuke/pinact)を使ってGitHub Actionsのバージョンをfull-length commit SHAに固定しています。

```bash
# バージョンを固定する
pinact run

# バージョンを更新して固定する
pinact run --update --min-age 7
```

## ビルド

```bash
pnpm build:win
pnpm build:mac
```

GitHub Actionsの `Release` ワークフローはインストーラーを作成し、指定したバージョンのGitHub Releaseへアップロードします。自動更新、署名、公証は行いません。

## ライセンス

MIT Licenseです。詳細は [LICENSE](LICENSE) を参照してください。
