# CLAUDE.md

Claude Codeがこのリポジトリで作業するためのメモです。

## プロジェクト概要

hiho-cli-audioは、WindowsとmacOS向けの個人用Electron常駐アプリです。

グローバルホットキーで録音を開始、停止し、録音音声をGemini APIで文字起こしします。文字起こしが完了した結果はメインプロセスで自動的にクリップボードへコピーします。

画面は常時表示しません。主なUIは、録音中、認識中、完了、失敗だけを短時間表示する小型状態ウィンドウと、過去結果を再コピーする小型履歴ウィンドウです。録音用レンダラーはMediaRecorderを動かすための非表示ウィンドウです。

Linux、アプリ内設定画面、自動更新、署名、公証は初期版の対象外です。

## 主要コマンド

```bash
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm build
pnpm build:win
pnpm build:mac
```

パッケージ管理にはpnpmを使います。

## 技術スタック

- Electron
- TypeScript
- Vue
- electron-vite
- MediaRecorder API
- ffmpeg-static
- @google/genai
- js-yaml
- Zod

## アーキテクチャ

### Main Process

メインプロセスはアプリの中心です。

- 起動、終了、常駐ライフサイクルを管理する
- YAML設定ファイルを読み込む
- グローバルホットキーを登録する
- トレイまたはメニューバーを作成する
- 状態、履歴、録音の3ウィンドウを作成する
- 録音レンダラーからWebM音声を受け取る
- FFmpegでWebMを16kHzモノラルWAVへ変換する
- Gemini APIで文字起こしする
- 成功結果をクリップボードへコピーする
- 履歴、状態、ログを保存する

### Renderer

レンダラーは用途別に分かれています。

- `recording.html` は非表示の録音用ページ
- `status.html` は小型状態ウィンドウ
- `history.html` は小型履歴ウィンドウ

録音用ページだけがマイク入力とMediaRecorderを扱います。状態ページと履歴ページは表示とユーザー操作に専念します。

### IPC

IPCは次の用途に限定します。

- メインプロセスから録音開始と停止を指示する
- 録音レンダラーからWebM音声を渡す
- 状態ウィンドウへ録音中、認識中、完了、失敗を通知する
- 履歴ウィンドウから一覧取得と再コピーを依頼する

設定画面は存在しないため、設定の取得、更新、リセット用IPCはありません。

## 音声処理フロー

1. ホットキー押下でメインプロセスが録音レンダラーへ開始指示を送る
2. 録音レンダラーがOS既定マイクからWebM音声を録音する
3. 再度ホットキー押下、または自動停止タイマーで録音を停止する
4. 録音レンダラーがWebM音声をメインプロセスへ送る
5. メインプロセスがWebMを一時保存する
6. FFmpegで16kHzモノラルWAVへ変換する
7. 変換成功後にWebMを削除し、WAVを音声ログとして保持する
8. Gemini APIへWAVを送信して文字起こしする
9. 成功結果をクリップボードへコピーし、履歴へ保存する
10. 失敗時は履歴に失敗として保存し、内部ログへ詳細を出す

文字起こしジョブは並列実行できます。完了した順にクリップボードへコピーし、後から完了した結果がクリップボードの最終内容になります。

## データ保存

保存先はElectronの `app.getPath('userData')` 配下です。

```text
userData/
  config.yaml
  state.json
  history.json
  audio/
    <history-id>.wav
  logs/
    app.log
  tmp/
    <recording-id>.webm
```

設定ファイルは手動編集します。実行中の監視や再読み込みは行いません。設定変更は再起動後に反映します。

APIキーは `config.yaml` に平文保存します。作業中にユーザー環境の設定ファイルや認証情報を読まないでください。

## 設定構造

設定は `src/main/schemas.ts` と `src/main/types.ts` で管理します。

主なキーです。

- `app.alwaysOnTop`
- `hotkeys.toggleRecording.windows`
- `hotkeys.toggleRecording.macos`
- `recording.autoStopSeconds`
- `transcription.provider`
- `transcription.gemini.apiKey`
- `transcription.gemini.model`
- `transcription.language`
- `history.maxItems`
- `windows.status`
- `windows.history`
- `vocabulary`

設定エラーは起動時に検出し、危険な処理を開始しません。

## エラー処理

起動時エラーは `ErrorDialogService` で表示します。設定エラー、Gemini初期化エラー、ウィンドウ初期化エラー、トレイ初期化エラーが対象です。

ホットキー登録失敗はダイアログで表示し、アプリ常駐は継続します。録音機能は待機状態のままにします。

実行時の文字起こし失敗、FFmpeg失敗、Gemini失敗、ネットワーク失敗ではダイアログを出しません。小型状態ウィンドウへ短時間表示し、履歴へ失敗として記録し、内部ログへ詳細を出します。

## ビルドと配布

`electron-builder.yml` はWindowsとmacOSだけを対象にします。

- WindowsはNSIS
- macOSはDMG
- Linuxは対象外
- 自動更新は対象外
- macOS署名は `mac.identity: null` で無効化する
- 公証は対象外

`.github/workflows/build.yml` は手動実行のリリースワークフローです。指定されたバージョンを `package.json` に反映し、型チェック、ESLint、electron-viteビルド、electron-builderパッケージ作成を実行します。インストーラーを指定したバージョンのGitHub Releaseへアップロードします。

## プロジェクト構造

```text
hiho-cli-audio/
  .github/workflows/
    build.yml
  build/
    entitlements.mac.plist
    icon.icns
    icon.ico
    icon.png
  docs/
  resources/
    icon.png
  src/
    main/
      appInitializer.ts
      atomicFile.ts
      audioIpcHandler.ts
      audioProcessor.ts
      configService.ts
      errorDialogService.ts
      geminiClient.ts
      geminiService.ts
      historyService.ts
      hotkeyService.ts
      index.ts
      loggerService.ts
      schemas.ts
      stateService.ts
      transcriptionJobService.ts
      trayService.ts
      types.ts
      windowService.ts
    preload/
      index.d.ts
      index.ts
    renderer/
      history.html
      recording.html
      status.html
      src/
        audioRecorder.ts
        history.ts
        recording.ts
        status.ts
        components/
          VoiceRecorder.vue
        pages/
          HistoryApp.vue
          RecordingApp.vue
          StatusApp.vue
    shared/
      types/
  electron-builder.yml
  electron.vite.config.ts
  package.json
  tsconfig.json
  tsconfig.node.json
  tsconfig.web.json
```

## コーディング方針

- 周囲のコードスタイルを優先する
- ドキュメント、エラーメッセージ、コード内コメントは日本語で書く
- publicな関数やクラスには1行のdocstringを書く
- コメントは明確な必要がある場合だけ書く
- 想定外の挙動は例外にする
- エラーを握りつぶさない
- 関数の引数と返り値には型を付ける
- TypeScriptの型アサーションとnon-null assertionを避ける
- 設定値や外部入力はZodで検証する
- 不要な互換処理やフォールバックを増やさない
