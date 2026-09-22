# hiho-cli-audio

ホットキーで録音した音声をGemini APIで文字起こしし、クリップボードまたはHerdrへ送る常駐アプリです。WindowsとmacOSで使えます。

## インストール

[GitHub Releases](https://github.com/Hiroshiba/hiho-cli-audio/releases)で署名済みの公開版を選び、OSに合うファイルをダウンロードしてください。

- Windowsの通常インストーラー: `hiho-cli-audio-<version>-windows-x64-setup.exe`
- WindowsのWebインストーラー: `hiho-cli-audio-<version>-windows-x64-web-setup.exe`
- macOS: `hiho-cli-audio-<version>-macos-x64.zip`

Windowsではいずれかのインストーラーを実行します。Webインストーラーはインストール時にアプリ本体をダウンロードするため、インターネット接続が必要です。macOSではZIPを展開し、hiho-cli-audioをアプリケーションフォルダへ移します。

初回導入前に[中央の端末設定手順](https://github.com/Hiroshiba/oreore-codesigner/blob/63b1b7ded84cb7809fd5386b00df8706af3dc8b8/docs/device-setup.md)に従い、配布元と公開証明書を確認してください。自己署名はAppleの公証の代替ではなく、macOSのGatekeeperやWindowsのSmartScreenによる警告は残り得ます。OS全体の保護設定は無効にしないでください。

従来の未署名`edge`版から最初の署名済み版へ移るときは、署名済み版を手動で再インストールしてください。以後、署名済みのパッケージ版は公開されたLatest Releaseを起動時と1時間ごとに確認し、更新を自動でダウンロードします。ダウンロードが完了すると常駐メニューに「更新して再起動」が現れます。選択時に録音や文字起こしが進行中なら、その完了後に再起動します。終了時の自動適用や、操作なしの再起動は行いません。更新に失敗した場合は現行版を使い続けます。Webインストーラーは自動更新に使用しません。

`main`の更新ではReleaseを自動公開しません。署名済み成果物を中央の署名ワークフローで既存のdraft Releaseへアップロードし、動作確認が終わってから公開します。

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
履歴ウィンドウはOSのシステムテーマに追従し、ライトモードとダークモードを切り替えます。

macOSでホットキーが反応しない場合は、システム設定でhiho-cli-audioにアクセシビリティ権限を与えてください。

## Herdrへ入力する

設定ファイルに`herdr`を追加すると、録音開始時に対象のターミナルが前面にある場合だけ認識結果をHerdrへ送ります。`herdr`を設定しない場合は、常にクリップボードへ保存します。

<details>
<summary>Herdr連携の設定例と出力条件を確認する</summary>

### Herdrのタイトル設定

Herdrは[バージョン0.8.2以降](https://github.com/herdrdev/herdr/releases/tag/v0.8.2)を使用します。Herdrの[設定ファイル](https://herdr.dev/docs/configuration/)である`~/.config/herdr/config.toml`へ次の設定を追加します。WSL内でHerdrを動かす場合は、WSL側の設定ファイルを編集してください。これはhiho-cli-audioの`config.yaml`とは別のファイルです。

```toml
[ui]
window_title = "[HERDR] {hostname}: {workspace}"
```

既に`[ui]`セクションがある場合は、`window_title`の行だけを追加します。編集後に`herdr server reload-config`で設定を再読み込みします。

iTerm2、Windows Terminal、WezTermは、アプリによるタイトル変更を許可し、ウィンドウタイトルへ反映する設定で使用します。

### macOS

Herdr実行ファイルの絶対パスを指定します。

```yaml
herdr:
  macos:
    binaryPath: '/absolute/path/to/herdr'
```

iTerm2を前面にし、ウィンドウタイトルに`[HERDR]`が表示されることを確認してから録音を始めます。前面状態の取得時にSystem Eventsの操作を求められた場合は、hiho-cli-audioに自動化を許可してください。

### Windows

使用するWSLの情報と、WSL内にあるHerdr実行ファイルのパスを指定します。

```yaml
herdr:
  windows:
    wslDistribution: '<WSLディストリビューション名>'
    wslUser: '<WSLユーザー名>'
    binaryPath: '<WSL内のHerdr実行ファイルのパス>'
```

Windows TerminalでUbuntuの[標準プロファイル](https://github.com/ubuntu/wsl-setup/blob/86a561d5149a9d76ec3c9b3ce2745e7ebca5f2ad/wsl/terminal-profile.json#L5)を使う場合は、アプリによるタイトル変更を抑止する`"suppressApplicationTitle": true`が設定されています。Windows Terminalの`settings.json`で`profiles.list`内の使用するWSLプロファイルに`"suppressApplicationTitle": false`を追加するか、既存の値を変更してください。

Windows TerminalまたはWezTermを前面にし、ウィンドウタイトルに`[HERDR]`が表示されることを確認してから録音を始めます。

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

Windowsのローカルビルドは通常NSISだけを作成します。ローカルビルドは配布用の署名済み成果物ではありません。配布には[中央の署名ワークフロー](https://github.com/Hiroshiba/oreore-codesigner/blob/63b1b7ded84cb7809fd5386b00df8706af3dc8b8/.github/workflows/sign-release.yml)を使用します。

公開するバージョンは`package.json`のSemVerで指定し、`pnpm-lock.yaml`とともにコミットしてタグを付けます。タグのReleaseをdraftで先に作成し、中央ワークフローを既定ブランチから`repository=Hiroshiba/hiho-cli-audio`と対象`tag`で実行します。中央は同一ソースSHAからmacOS x64のZIP、Windows x64の通常NSISとNSIS Webを署名し、既存Releaseの成果物だけを更新します。Releaseのdraft状態は変更しません。成果物と実機動作を確認してからdraftを公開してください。

次の版は現行版より大きいSemVerにし、更新metadataとその参照先の通常NSISまたはZIP、blockmap、サイズ、SHA-512が一致することを公開前に確認してください。アプリID、実行ファイル名、インストーラーの識別情報、署名証明書を継続して使用します。証明書の更新が必要な場合は、公開前に旧版からの更新をWindowsとmacOSの実機で確認してください。公開するReleaseはLatest Releaseとして参照され、draftやprereleaseは更新対象になりません。

中央のGitHub Appには対象リポジトリをSelected repositoriesとして許可し、Contentsの読み書き権限を設定します。中央リポジトリのrepository variableにApp IDを`SIGNING_APP_ID`、repository secretに秘密鍵を`SIGNING_APP_PRIVATE_KEY`として登録します。macOSのP12とパスワードは中央の`macos-signing` environment secretの`MACOS_CERTIFICATE_P12_BASE64`と`MACOS_CERTIFICATE_PASSWORD`、WindowsのPFXとパスワードは`windows-signing` environment secretの`WINDOWS_CERTIFICATE_PFX_BASE64`と`WINDOWS_CERTIFICATE_PASSWORD`へ登録し、両environmentに承認者を設定します。このリポジトリへ署名鍵や公開用トークンを登録しません。設定と失敗時の再実行は中央の[初期設定](https://github.com/Hiroshiba/oreore-codesigner/blob/63b1b7ded84cb7809fd5386b00df8706af3dc8b8/docs/github-setup.md)と[運用手順](https://github.com/Hiroshiba/oreore-codesigner/blob/63b1b7ded84cb7809fd5386b00df8706af3dc8b8/docs/operations.md)を参照してください。

詳しい仕様は[要件定義書](docs/要件定義書.md)を参照してください。

## ライセンス

ライセンスは[MIT License](LICENSE)です。
