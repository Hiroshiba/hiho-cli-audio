# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

このプロジェクトは、Gemini音声認識APIを利用したMac/Windows対応のElectronアプリケーションです。ホットキー（Ctrl+Shift+D）によるトリガーでマイク音声の録音開始/停止を制御し、リアルタイムで文字起こしを行い、認識結果を常時表示してクリップボードコピーボタンを提供する最前面表示型アプリケーションです。

## 開発環境とツール

### パッケージ管理

- **pnpm**: Node.jsパッケージマネージャーを使用
  - `pnpm install` でプロジェクトの依存関係をインストール
  - `pnpm dev` で開発サーバーを起動
  - `pnpm build:win/mac/linux` でアプリケーションをビルド

### 必須ライブラリ

- **Electron**: デスクトップアプリケーションフレームワーク
  - メインプロセス・レンダラープロセスの制御
  - グローバルホットキー機能
  - クリップボード操作機能
- **Vue.js**: フロントエンドフレームワーク
  - 設定画面・UI コンポーネント
  - リアクティブなデータバインディング
  - TypeScript対応
- **electron-vite**: Electron向けビルドツール・開発サーバー
  - 高速なHMR（Hot Module Replacement）
  - TypeScript・Vue SFC対応
  - Electron向けの最適化
- **@google/genai**: Gemini API クライアント（メインプロセス）
- **fetch**: HTTP クライアント（標準Web API）
- **ffmpeg-static**: WebMからWAVへの音声変換・リサンプリングライブラリ（静的バイナリ）
- **MediaRecorder API**: WebM形式音声録音ライブラリ（レンダラープロセス）
- **Zod**: データバリデーション・型安全性
- **js-yaml**: YAML設定ファイル読み込み

### GitHub Actions自動ビルド・リリースシステム

`.github/workflows/build.yml`で完全自動化されたクロスプラットフォームビルド・リリースシステムを構築

**ワークフロー構成:**

1. **buildジョブ（並行実行）**:
   - **Windows**: windows-latest + NSIS installer
   - **macOS**: macos-latest + DMG + ARM64対応
   - **Linux**: ubuntu-latest + electronuserland/builderコンテナ + AppImage

2. **promote-releaseジョブ（順次実行）**:
   - 全ビルド完了後にプレリリースを正式リリースに昇格
   - Latest状態に自動設定

**主要機能:**

- **ワンクリックリリース**: `gh workflow run build.yml --field version=1.0.0`
- **2段階プロセス**: ビルド → パブリッシュ で確実な成果物生成
- **リトライ機構**: 並行アップロード競合時の自動リトライ（最大3回・段階的待機）
- **差分アップデート**: electron-builderによる最適化されたインストーラー
- **自動アップデート対応**: latest.yml自動生成

**実行方法:**

```bash
# 新バージョンのリリース（全プラットフォーム自動ビルド・公開）
gh workflow run build.yml --field version=1.0.0
```

## アーキテクチャ設計指針

### 設定管理

- 設定ファイルは `~/.config/hiho-cli-audio/config.yaml` に配置
- Zodスキーマで設定値をバリデーション
- API キーなどの機密情報は設定ファイルで管理（Node.jsの暗号化を検討）
- ホットキー設定（デフォルト: Ctrl+Shift+D）の変更可能

### Electronアーキテクチャ

- **メインプロセス**: グローバルホットキー・リサンプリング・Gemini API・設定管理
- **レンダラープロセス**: 音声録音・認識結果表示・クリップボードコピー・設定画面・Vue.js UI
- **IPC通信**: メインプロセスとレンダラープロセス間のデータ交換
- **IPCブリッジ**: 録音データをレンダラーからメインプロセスに転送
- **最前面表示**: ウィンドウを最前面に常時表示

### 音声処理フロー

1. **ホットキー監視**: メインプロセスでグローバルホットキー（CommandOrControl+Shift+D）を監視
2. **録音制御**: ホットキー押下でIPCブリッジを通じてレンダラーに録音開始/停止指示
3. **音声録音**: レンダラープロセスでMediaRecorderによるWebM形式音声データのリアルタイム録音
4. **データ転送**: IPCブリッジでWebM音声データをメインプロセスに転送
5. **音声変換**: メインプロセスでFFmpeg-staticを使用してWebMから16kHzモノラルWAVへリサンプリング
6. **音声認識**: 録音停止時に@google/genaiを使用してGemini APIでWAVファイルを音声認識
7. **結果処理**: 認識結果をレンダラーに送信して表示、クリップボードコピーボタンを提供
8. **クリーンアップ**: トークン使用量とコスト情報をログ出力、一時ファイルの削除

### エラー処理戦略

- 想定外の挙動では例外を投げる
- フォールバック処理は極力避ける
- ネットワークエラーやAPI キー関連のエラーはコンソールログで表示
- メインプロセスのエラーではアプリケーションを継続

## コーディング規約

### TypeScript/Node.js固有の規約

- TypeScript 5.0+対応コードで記述
- 厳密な型チェック設定（`strict: true`）を使用
- `any`型の使用を避け、具体的な型定義を使用
- Node.jsのESModules（`import`/`export`）を使用
- ファイルパス操作は `node:path` モジュールを使用
- ファイル読み書きは `node:fs/promises` を使用

### 一般的な規約

- 関数・クラスには1行のJSDocを記述
- 変数名・関数名から自明なコメントは書かない
- **コード内コメントは可能な限り少なくする**（コメントが必要=コードが複雑すぎる証拠）
- **関数の引数にはデフォルト値を絶対に設定しない**
  - `function process(data: string, options: Options = {}): void` ❌ 絶対NG
  - `function process(data: string, options: Options): void` ✅ 必須引数として定義
  - 必要な引数は必須とし、不要な引数は削除する
- **関数の引数をオプショナル（?）にしない**
  - `function process(data: string, options?: Options): void` ❌ 絶対NG
  - `function process(data: string, options: Options): void` ✅ 必須引数として定義
  - 使わない引数は削除し、使う引数は必須にする
- **設定ファイルでのデフォルト値定義は例外として許可**
  - `DefaultConfig`オブジェクトや`schemas.ts`でのデフォルト値は許可
  - 関数の引数のデフォルト値とは別物
- 型注釈を必須とする
- **型サポートを極力活用する**
  - `any`や`object`などの抽象的な型を避け、具体的な型を使用
  - 戻り値には`Record<string, any>`ではなくinterfaceや型定義を使用
  - 型安全性を最大限に活用してバグを防止
- null・undefined・空文字・-1に特別な意味を持たせない
- **コメントは必ず日本語で記述する**（package.jsonの設定コメント含む）
- **既存のコードスタイルに必ず合わせる**（命名規則・IPC通信の命名・関数の書き方など）

### セキュリティ

- API キーやクレデンシャル情報をコードに埋め込まない
- 設定ファイルは適切なパーミッションで保護
- **機密情報の暗号化**を使用してAPIキーをログ・エラーメッセージから保護
  - console.logやエラー出力時に自動的に「\***\*\*\*\*\***」でマスク
  - 実際の値は復号化関数で取得

### 重要な制約事項

**設定ファイルを読み取り禁止**

- **絶対に設定ファイル（~/.config/hiho-cli-audio/config.yaml）の内容を読み取らない**
- **APIキーなど機密情報の流出防止のための徹底ルール**
- **他のセッションでも必ずこのルールを遵守すること**

**防御的プログラミング禁止**

- **起動時のフォールバック処理は禁止**（設定ファイル読み込み失敗時はエラーで停止）
- **関数・メソッドのデフォルト引数は絶対禁止**（設定ファイルのデフォルト値定義とは別物）
- **オプショナル引数（?）の使用を絶対禁止**（必要な引数は必須にする）
- **switch文・条件分岐でのdefaultケースは適切なエラーにする**

**厳格な初期化規約（絶対遵守）**

- **プロパティをnull・undefinedで初期化することを絶対禁止**
  - `private service: Service | null = null` ❌ 絶対NG
  - `private service: Service` ✅ コンストラクターで初期化
- **TypeScript非null assertion演算子（!）の使用を絶対禁止**
  - `private service!: Service` ❌ 絶対NG
  - コンストラクターでの適切な初期化のみ許可
- **後からinitialize()メソッドで設定することを禁止**
  - 設定が必要なオブジェクトは作成時にコンストラクターで依存関係を注入
- **遅延初期化パターンを禁止**
  - すべての依存関係はコンストラクター実行時に解決

**シングルトンパターンの正しい実装**

```typescript
// ✅ 正しいパターン
export class WindowService {
  private static instance: WindowService // nullで初期化しない
  private readonly config: Config // readonlyで依存関係を保護
  private readonly mainWindow: BrowserWindow

  private constructor(config: Config) {
    // 依存関係をコンストラクターで注入
    this.config = config
    this.mainWindow = this.createWindow()
  }

  static getInstance(config: Config): WindowService {
    if (!WindowService.instance) {
      WindowService.instance = new WindowService(config)
    }
    return WindowService.instance
  }

  static getExistingInstance(): WindowService {
    if (!WindowService.instance) {
      throw new Error('サービスが初期化されていません')
    }
    return WindowService.instance
  }
}
```

**禁止される実装パターン**

```typescript
// ❌ これらは絶対に書いてはいけない
private service: Service | null = null
private service!: Service
private service?: Service
private service: Service = undefined as any

// ❌ 後から初期化するパターンも禁止
initialize(config: Config): void {
  this.service = new Service(config)  // NG
}
```

**許可される唯一の例外**

- シングルトンの静的インスタンス変数のみ（`private static instance: ClassName`）
- 明確な状態管理が必要な場合の一時的なnull使用（コメントで理由を明記）

**ファイル名規約**

- **TypeScriptファイルはcamelCase.tsで命名する**（例: `ipcTypes.ts`, `audioRecorder.ts`）
- **ケバブケース（kebab-case）は使用しない**（例: `ipc-types.ts`）
- **この規約は新規ファイル作成時に必ず適用する**

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

例: `feat(audio): 音声認識機能を追加`, `docs: API仕様書を更新`

## 外部システム連携

### OS統合

- クリップボード操作: Electronの`clipboard`モジュール使用
- ホットキー: Electronの`globalShortcut`モジュールでグローバルホットキー監視
- 最前面表示: ウィンドウを最前面に常時表示
- プロセス制御: メインプロセスでのイベント処理
- 音声処理: FFmpegバイナリをNode.jsから実行

### API統合

- Gemini音声認識API
- 入力/出力トークン数の記録
- レート制限とエラーハンドリング

## ログとモニタリング

- コンソールログを使用
- 処理開始/完了のタイムスタンプ
- トークン使用量の記録
- エラー発生時の詳細情報

## プロジェクト構造

```
hiho-cli-audio/
├── src/
│   ├── main/              # メインプロセス
│   │   ├── index.ts       # Electronメインプロセス
│   │   ├── appInitializer.ts    # アプリケーション初期化
│   │   ├── configService.ts     # 設定ファイル管理
│   │   ├── windowService.ts     # ウィンドウ管理・最前面表示機能
│   │   ├── audioProcessor.ts    # 音声リサンプリング機能（FFmpeg）
│   │   ├── geminiClient.ts      # Gemini APIクライアント
│   │   ├── geminiService.ts     # Gemini API連携サービス
│   │   ├── hotkeyService.ts     # ホットキー監視機能（グローバルショートカット）
│   │   ├── audioIpcHandler.ts   # 音声関連IPC通信ハンドラー
│   │   ├── configIpcHandler.ts  # 設定関連IPC通信ハンドラー
│   │   ├── ipcTypes.ts    # IPC通信用型定義
│   │   ├── schemas.ts     # Zodスキーマ
│   │   └── types.ts       # 型定義
│   ├── preload/           # プリロード
│   │   ├── index.ts       # プリロードスクリプト
│   │   └── index.d.ts     # プリロード型定義
│   └── renderer/          # レンダラープロセス
│       ├── index.html     # メインHTML
│       └── src/
│           ├── main.ts        # Vue.jsエントリーポイント
│           ├── App.vue        # メインVueコンポーネント
│           ├── audioRecorder.ts # 音声録音機能（Web Audio API）
│           ├── components/    # Vueコンポーネント
│           └── assets/        # 静的アセット
├── package.json           # プロジェクト設定・依存関係
├── vite.config.ts         # Viteビルド設定
├── tsconfig.json          # TypeScript設定
└── electron-builder.yml  # Electronビルド設定
```

### プロジェクト構造の特徴

- **メインプロセス**: Electron本体・システム統合機能・リサンプリング・Gemini API
- **レンダラープロセス**: Vue.js UI・認識結果表示・クリップボードコピー・設定画面・音声録音機能
- **IPCブリッジ**: プロセス間通信とデータ転送
- **TypeScript**: 型安全性とコード品質向上
- **Vite**: 高速なHMRと最適化されたビルド

## 開発時の注意点

- 単一ユーザー用途での設計（設定ファイルはホームディレクトリ配下）
- 最前面表示によるウィンドウ常時表示型アプリケーション
- 起動から待機状態まで5秒以内のパフォーマンス要件
- macOS（最新2バージョン）とWindows 10/11の両対応が必要
- ホットキー監視によるCPU使用率の最小化
- Web Audio APIの制限とFFmpegによるリサンプリング処理
- IPCブリッジによるプロセス間データ転送の最適化

## 実行方法

### 開発環境での実行

```bash
# 依存関係インストール
pnpm install

# 開発サーバー起動
pnpm dev
```

### プロダクションビルド

```bash
# Windows向けビルド
pnpm build:win

# macOS向けビルド
pnpm build:mac

# Linux向けビルド
pnpm build:linux
```

### 重要な注意点

- **メインプロセスとレンダラープロセスの分離**: IPCでの通信が必要
- **pnpm devが必須**: 開発環境ではelectron-vite devサーバーを使用
- **絶対インポート**: `@/`エイリアスを使用してsrcディレクトリを参照

### 開発ツール

#### ESLint・Prettier（コードフォーマッター・リンター）

- TypeScript・Vue.js対応設定
- Electronプロジェクト用の設定

```bash
# リント実行
pnpm lint

# フォーマット実行
pnpm format
```

#### TypeScript

- 厳密な型チェック設定
- メインプロセス・レンダラープロセス個別設定

```bash
# 型チェック実行
pnpm typecheck
```

## README.md メンテナンス方針

README.mdは以下の方針で簡潔に維持する：

- **使用者向けの必要最小限の情報のみ記載**
- **長ったらしい説明や重複する内容は削除**
- **インストールとアプリケーション実行を中心とした構成**
- **技術的詳細は開発環境セクションにとどめる**
- **GitHubでよく見るシンプルな形式を保持**

## Python → Electron 移行タスクリスト

### 移行状況

- **元プロジェクト**: `OldPython/` ディレクトリにPythonベースのCLIアプリケーション
- **現在の状況**: **全機能が完成・動作中** - ホットキー録音・音声認識・クリップボード連携・UI改善が完了
- **移行目標**: 全機能をElectronアプリケーションに移行
- **達成度**: フェーズ1〜4の全機能（11/11タスク）が完了、プロダクション品質のアプリケーションが動作

### 移行タスクの優先順位

#### フェーズ1: 基盤整備（必須）

1. **プロジェクト依存関係の整備** (完了)
   - 必要なライブラリの追加（@google/genai、zod、js-yaml等）
   - TypeScript型定義の整備
   - FFmpegバイナリの統合検討（後回し）

2. **型定義とスキーマの実装** (完了)
   - 音声・設定・API関連の型定義作成
   - Zodスキーマによる設定ファイルバリデーション
   - IPC通信用のインターフェース定義

3. **設定ファイル管理機能の実装** (完了)
   - YAML設定ファイルの読み込み・書き込み
   - デフォルト設定ファイルの自動生成
   - 設定値の型安全な管理

#### フェーズ2: コア機能実装（高優先度）

4. **メインプロセス: Gemini API連携** (完了)
   - @google/genaiクライアントの実装
   - 音声ファイルアップロード機能
   - トークン使用量とコスト計算
   - エラーハンドリング機能

5. **メインプロセス: 音声処理** (完了)
   - FFmpegによる音声リサンプリング機能
   - 一時ファイル管理
   - 音声フォーマット変換

6. **レンダラープロセス: 音声録音** (完了)
   - MediaRecorderによる音声録音機能
   - WebM形式リアルタイム音声データ収集
   - 録音状態の管理

#### フェーズ3: システム統合（中優先度） - 進捗: 3/3完了

7. **IPC通信の実装** (完了)
   - メインプロセス ⇔ レンダラープロセス間通信
   - WebM形式録音データの効率的な転送
   - 設定変更の同期

8. **グローバルホットキー機能** (完了)
   - ElectronのglobalShortcutモジュール使用
   - ホットキー設定の動的変更（CommandOrControl+Shift+D）
   - 競合回避とエラーハンドリング
   - IPCブリッジによる録音開始/停止制御
   - レンダラープロセスでのIPC受信処理とAudioRecorder連携

9. **最前面表示機能** (完了)
   - ウィンドウの最前面常時表示機能
   - プラットフォーム別対応（macOS/Windows）
   - WindowServiceによるシングルトン管理
   - 設定による動的制御

#### フェーズ4: UI・UX実装（低優先度） - 進捗: 2/2完了

10. **認識結果表示機能** (完了)
    - 音声認識結果のリアルタイム表示
    - 録音中と音声認識中のステータス表示
    - 前回の認識結果の履歴表示

11. **クリップボードコピー機能** (完了)
    - 認識結果のワンクリックコピーボタン
    - コピー成功時の視覚的フィードバック
    - 自動コピー機能（音声認識完了時）
    - フォールバック処理（Web API → IPC経由）

#### フェーズ5: 最終調整（必須）

12. **統合テスト** (完了)
    - エンドツーエンドのワークフロー確認
    - 各プラットフォームでの動作確認
    - パフォーマンステスト

13. **エラーハンドリングの強化** (一時保留)
    - 例外発生時の適切な復旧処理
    - ユーザーフレンドリーなエラーメッセージ
    - ログの改善

14. **ドキュメントとREADMEの更新** (完了)
    - 新しいElectronアプリケーションの使用方法
    - ~~トラブルシューティングガイド~~ (不要)
    - ~~開発者向けドキュメント~~ (不要)

15. **OldPythonディレクトリの削除** (完了)
    - 移行完了後のPythonプロジェクトの削除
    - 不要なファイルのクリーンアップ

16. **ビルドとGitHub Actions配布機能の実装** (進行中)
    - Electron-builderによるプラットフォーム別ビルド
    - GitHub Actionsでの自動ビルド・リリース
    - 配布用の設定ファイル整備

17. **自動アップデートダイアログ表示ロジックの調査** (未着手)
    - UpdaterServiceの`checkForUpdatesAndNotify()`の動作確認
    - 更新がない場合・更新がある場合のダイアログ表示の検証
    - electron-updaterの通知設定とユーザー体験の確認
    - 手動更新確認時のダイアログ表示ロジックの改善検討

### 移行時の重要な考慮事項

#### 技術的な変更点

- **CLI → GUI**: コマンドラインからGUIアプリケーションへ
- **sounddevice → Web Audio API**: 音声録音APIの変更
- **pynput → Electron globalShortcut**: ホットキー処理の変更
- **pyperclip → Electron clipboard**: クリップボード操作の変更
- **Pydantic → Zod**: データバリデーションライブラリの変更

#### 注意すべき制約事項

- **プラットフォーム差異**: macOS/Windows/Linuxでの動作確認
- **セキュリティ**: サンドボックス環境での制約
- **パフォーマンス**: Web Audio APIの制限とFFmpeg処理の最適化
- **メモリ管理**: 大量音声データの効率的な処理

### 移行の進め方

1. **段階的な実装**: フェーズ1から順次実装
2. **既存機能の保持**: PythonプロジェクトのOldPythonディレクトリは一時的に保持
3. **継続的なテスト**: 各フェーズ完了時に動作確認
4. **最終クリーンアップ**: 移行完了後にOldPythonディレクトリを削除
