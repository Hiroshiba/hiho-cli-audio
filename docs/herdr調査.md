herdrこれは音声認識の結果です。HearDっていうのを使ってるんですよ。H-E-A-R-D-R。これに関して、今カーソルが当たってるところに音声認識した結果を後で挿入するっていう機能ってあったりしますか。つまり、音声認識って終了したときにクリップボードとかにこう現れると思うんですけれども、それだとそうじゃなくてここに入力したいっていうやつを後で変えたいときはなくて、ここに入力したいっていうのを登録しておいてそこに突っ込むみたいなことにしたいんですね。でも基本的に音声認識が終わったときってしばらく時間が経った後なので、カーソルが別の場所に移ってて、そこのカーソルの場所にコピーペーストしちゃうとかってなっちゃうんですよ。なのでカーソルの場所を保存しておいて、そこに音声認識した結果を突っ込むみたいなのってあったりしますかね。というのを、多分そんな機能はないと思うんで、とりあえずそういう機能があるかどうか調べてみて。なさそうだったらとりあえずそういうイシューが立ってるかどうかとか、音声認識に関する関連のイシューが立ってるかどうかとかチェックしてみてください。で、そのイシューを立てられそうだったら立ててみようかなとも思っているので、います。ただそのイシューの内容の提案はいらないです。この段階では。では調査お願いします。



## 結論

**Herdr（公式表記は H-E-R-D-R）には、音声認識開始時の入力位置を「挿入先」として保存し、認識完了後にその位置へ結果を差し込む標準機能は、2026年8月30日時点では見当たりませんでした。**

現行安定版の **v0.8.2**、公開されている設定一覧・ドキュメント、現在の `master` の未リリース Changelog、公開 Issue・PR・Discussion を確認しましたが、次の一連の動作を提供する機能は確認できませんでした。

1. 音声認識開始時のペイン／カーソル位置を登録する
2. その後、別の場所で作業する
3. 認識完了時に、登録しておいた位置へ結果を挿入する

未リリース変更にも該当する追加はありません。([Herdr][1])

## 「元のペイン」までなら既存機能で指定できる

ただし、Herdrには低水準の部品として、**特定のペインを指定して文字列を送る機能**があります。

* Herdrから起動するカスタムコマンドには、起動時にアクティブだったペインを示す `HERDR_ACTIVE_PANE_ID` が渡されます。
* `herdr pane send-text <pane_id> <text>` で、現在画面上でフォーカスされているペインとは別のペインにも文字列を送れます。

そのため、「カーソルが移動した」というのが、単に**別のHerdrペインへフォーカスを移した**という意味であれば、録音開始時のペインIDを保存しておき、認識完了後にそのペインへ送る構成自体は可能です。([Herdr][1])

一方で、Herdrが指定できるのは基本的に**ペインという端末の送り先**です。たとえばCodexの入力欄の「37文字目」、シェルの編集中コマンドの途中、エディタ内の特定箇所、といった**アプリケーション内部の過去の論理カーソル位置**を保存して、あとからそこへ挿入する汎用機能ではありません。ペイン内の入力欄やカーソル状態は、その中で動いているCodex、Claude Code、シェル、エディタなどが管理しています。([Herdr][2])

つまり、調査結果は次の区別になります。

* **録音開始時のHerdrペインを覚える**：既存APIを組み合わせれば可能
* **そのペイン内の過去の文字カーソル位置まで覚える**：汎用的な既存機能は見つからない
* **これを音声入力向けに一操作で行う標準機能**：見つからない

## 関連する既存Issue・Discussion

完全に同じ要望は見つかりませんでした。近いものは以下です。

### #2861 — macOSの音声入力がHerdr内で正しく転記されない

Voxtypeの音声入力を使うと、通常のGhosttyやSSHでは認識結果が入力される一方、Herdr内では文字列全体ではなく `a` だけが入るという報告です。現在も音声入力経路の互換性問題として扱われており、報告者は一時的にクリップボード貼り付け方式へ切り替えています。

今回の要望に最も近い音声認識Issueですが、**挿入先を録音開始時に固定する話ではなく、認識結果がHerdrのペインへ正しく入力されない問題**です。

### #63 — WeTypeの音声入力・IME入力の欠落

WeTypeの音声入力で、長い文章の冒頭部分しか入力されない、あるいはテキストが欠落するという報告を含むIssueです。こちらは修正対応後にクローズされています。

これも音声入力結果の伝達に関する問題で、元のカーソル位置を保持する機能ではありません。

### #2302 — push-to-talkでキーを離したイベントが届かない

Bubble Tea製TUIのpush-to-talk音声入力で、キーを押したイベントは届くものの、離したイベントがHerdr内で失われ、録音を終了できないという問題です。修正され、**v0.8.2に収録済み**です。

### #1578 — `pane read`でカーソル座標を取得できない

`pane read`の結果にカーソルの行・列が含まれず、外部クライアントが正しい場所に画面上のカーソルを描画できない、という要望です。

「カーソル位置」という点では近いのですが、これは**現在の画面カーソルを外部表示するためのAPI**であり、過去の挿入位置を保存して後から文字列を差し込む機能ではありません。さらに、このIssueは機能要望をIssueとして提出したため、Discussionへ出すよう案内されてクローズされています。

### Discussion #1343 — ペインごとの音声会話ボタン

任意のペインを選んで、そのペインのセッションと音声で会話するためのボタンやオーバーレイを設ける案です。音声入力と対象ペインの指定を組み合わせるという意味では最も近いDiscussionですが、**非同期の音声認識結果を、録音開始時の入力位置へ戻して挿入する提案ではありません**。([GitHub][3])

## 新しく立てる場合の場所

今回の内容は、既存機能が壊れているという再現可能なバグではなく、**新しい入力ワークフローの機能要望**に当たります。

Herdrの現在のコントリビューション方針では、

* 再現可能なバグ：GitHub Issue
* 機能要望、アイデア、設計変更、方向性の相談：GitHub Discussion

と明確に分けられています。Issueテンプレートにも一般的なfeature request用テンプレートはありません。したがって、提出するなら **IssueではなくDiscussionのIdeas系カテゴリ**が適切です。

公開Issueを `dictation`、`speech`、`voice`、`transcription`、`cursor position`、`focus`、`paste` などで全状態検索し、PRと検索可能なDiscussionも確認した範囲では、**今回の要望と同一の既存提案は見つかりませんでした**。したがって、現状では重複を強く心配せず、新規Discussionとして出せる内容だと思われます。ただし、GitHub検索のインデックス外にあるDiscussionまで完全に不存在だとは断定できません。

[1]: https://herdr.dev/docs/configuration/ "https://herdr.dev/docs/configuration/"
[2]: https://herdr.dev/docs/concepts/ "https://herdr.dev/docs/concepts/"
[3]: https://github.com/herdrdev/herdr/discussions/1343 "https://github.com/herdrdev/herdr/discussions/1343"



ありがとうございます。良さそうですね。じゃあそのペイン、例えば起動した時のペインに送る形にしましょうか。したいと思います。で、ちょっと面倒くさいんですけれども、僕の環境だとWindowsとMacで使っているんですよ。ハーダー、HTRDRを。で、Macの方はMac上でターミナルを開いていて、って感じなんで。ちなみに iTerm2を使ってますね。っていう感じ。で、Windowsの方は音声認識ツールの方はWindows側で立ち上がってて、で、ハーダーの方は WSL上で立ち上がってるんですよ。Windowsのデフォルトのターミナルを使ってますね。コマンドプロンプトじゃなくてターミナルの方を使っています。っていう形なんですけれども。それでもなんかその音声認識ツール、多分音声認識ツール側からそのハーダーを認識しないといけないですよね。それができるのかどうかっていうのをちょっと調べてみてほしいです。で、具体的にこれ、音声認識ツールとしてはこれを使っているっていうのがあるので、それを参考にしてください。
https://github.com/Hiroshiba/hiho-cli-audio



## 結論

**できます。macOS＋iTerm2でも、Windows＋Windows Terminal＋WSLでも実現可能です。**
しかも、音声認識アプリが iTerm2 や Windows Terminal の画面を解析したり、カーソル位置をOS経由で取得したりする必要はありません。

音声認識アプリから見た「Herdrを認識する」は、実際には次の処理になります。

```text
録音開始時
  ↓
Herdrに「現在のペインはどれか」と問い合わせる
  ↓
pane_id と Herdrセッション情報を録音セッションに保存
  ↓
音声認識完了
  ↓
保存したpane_idへ認識結果を送る
```

Herdrには現在ペインを取得する `herdr pane current` と、特定ペインへ文字列を送る `herdr pane send-text <pane_id> <text>` が既にあります。`send-text` は現在のフォーカスではなく、指定されたペインのPTYへ文字列を送ります。したがって、認識処理中に別のペインへ移動しても、保存したペインへ送れます。

## 現在の `hiho-cli-audio` との差分

現在の実装では、グローバルホットキーを押すと `HotkeyService` から録音開始・停止だけが呼ばれます。録音開始時に外部アプリやHerdrの情報を取得する処理はまだありません。

録音セッションには既に `sessionId` があり、録音データにも同じIDが載っています。一方、音声認識が完了すると、現状は無条件にElectronの `clipboard.writeText()` を呼んでいます。したがって、既存の `sessionId` に「出力先Herdrペイン」を関連付ければ、比較的小さな変更で実現できます。

概念的には次の情報を録音セッションごとに持たせます。

```ts
type TranscriptionTarget =
  | { type: "clipboard" }
  | {
      type: "herdr"
      paneId: string
      session?: string
      socketPath?: string
      herdrBinPath: string
      wsl?: {
        distribution: string
        user?: string
      }
    }
```

## macOS＋iTerm2

macOSでは `hiho-cli-audio` とHerdrが同じOS上で動いているので、ElectronのメインプロセスからHerdr CLIを直接起動できます。

録音開始時は概念的に次の問い合わせです。

```bash
/absolute/path/to/herdr pane current
```

返されたJSONの `result.pane.pane_id` を録音セッションに保存します。認識完了後は次を実行します。

```bash
/absolute/path/to/herdr pane send-text w1:p3 "認識結果"
```

iTerm2はHerdrクライアントを表示する外側の端末にすぎないため、iTerm2固有のAPIやAppleScript、アクセシビリティ権限は、この基本経路には不要です。Herdr CLIがHerdrサーバーへ問い合わせ、指定されたペインへ直接送ります。

実装上は、GUIアプリから起動したプロセスの `PATH` にHerdrが含まれないケースを避けるため、Herdrの絶対パスを設定として持つのが安全です。

## Windows＋Windows Terminal＋WSL

こちらも可能です。ただし、Windows版のElectronアプリからWSL内のUnixソケットへ直接接続するのではなく、**`wsl.exe` を中継して、WSL内のHerdr CLIを実行します。**

録音開始時は概念的に次の処理になります。

```powershell
wsl.exe -d Ubuntu -- /home/hihok/.local/bin/herdr pane current
```

認識完了後は次です。

```powershell
wsl.exe -d Ubuntu -- /home/hihok/.local/bin/herdr pane send-text w1:p3 "認識結果"
```

Microsoftの公式仕様として、Windowsプロセスから `wsl.exe` を使ってLinuxコマンドを実行でき、特定ディストリビューションも `-d` で指定できます。逆方向に、WSLからWindowsの `.exe` を起動することもできます。

したがって構成は次のようになります。

```text
Windows上のhiho-cli-audio.exe
  ↓ child_process.execFile("wsl.exe", ...)
WSL内のherdr CLI
  ↓ Unix socket
WSL内のHerdr server
  ↓
保存しておいたペイン
```

Windows Terminal自体に対する特別な連携は不要です。

複数のWSLディストリビューションがある場合は、デフォルトディストリビューションに依存せず、設定で次を固定した方がよいです。

```yaml
herdr:
  windows:
    wslDistribution: Ubuntu
    wslUser: hihok
    binaryPath: /home/hihok/.local/bin/herdr
```

Herdrを起動しているWSLユーザーと、`wsl.exe` がコマンドを実行するユーザーが異なると、所有者限定のHerdrソケットへ接続できません。そのため、必要なら `--user` も明示します。WSLはディストリビューションとユーザーの指定を公式にサポートしています。

## 一番簡単な実装方式

現在のグローバルホットキーを維持するなら、次の方式が最小です。

```text
1回目のホットキー
  ├─ Herdrの現在ペインを問い合わせる
  ├─ sessionId → HerdrTarget を保存する
  └─ 録音開始

2回目のホットキー
  └─ 録音停止・文字起こし開始

文字起こし完了
  ├─ sessionIdからHerdrTargetを取得する
  ├─ 保存したpaneIdへsend-text
  └─ クリップボードにも保存する
```

macOSとWindowsで異なるのは、Herdrコマンドの起動方法だけです。

```ts
// macOS
execFile(herdrBinPath, ["pane", "current"])

// Windows
execFile("wsl.exe", [
  "-d",
  distribution,
  "--",
  herdrBinPath,
  "pane",
  "current",
])
```

シェルコマンド文字列を組み立てるのではなく、`execFile` や `spawn` の**引数配列**を使うべきです。認識結果には引用符、ドル記号、セミコロンなどが入り得るため、`bash -lc "herdr ... $text"` のようにすると、外側のシェルで解釈される危険があります。

## ただし、グローバルホットキー方式には1つ制約がある

Electronの `globalShortcut` は、音声認識アプリや端末にフォーカスがなくても発火します。現在のコールバックには「どのアプリ上で押されたか」や「どのウィンドウで押されたか」という情報は渡されません。

そのため、たとえば次の状態でも `herdr pane current` 自体は成功し得ます。

```text
Herdrはバックグラウンドで起動中
ブラウザにフォーカスがある
そこで録音ホットキーを押す
    ↓
Herdrが最後に選択されていたペインが返る
```

つまり、`pane current` は「Herdr内部で現在選択されているペイン」は返せますが、**今まさにHerdrの外側の端末がOS上で最前面かどうかまでは保証しません**。Herdr CLIは呼び出し元に `HERDR_PANE_ID` がなければ、Herdr側の現在ペイン解決に委ねる実装になっています。

運用上、「このホットキーは基本的にHerdr上でしか押さない」のであれば、まずはこれで十分です。一般アプリでも同じ音声認識を使うなら、次のどちらかが必要になります。

* iTerm2／Windows Terminalが最前面かをOS別に確認し、最前面でなければ従来どおりクリップボードだけに出す
* Herdr側から音声認識を開始する

## より確実なのは「Herdr側から起動する」方式

Herdrのカスタムコマンドには、実行時に次の情報が渡されます。

* `HERDR_ACTIVE_PANE_ID`
* `HERDR_ACTIVE_WORKSPACE_ID`
* `HERDR_ACTIVE_TAB_ID`
* `HERDR_SOCKET_PATH`
* `HERDR_BIN_PATH`

したがって、Herdrのキーバインドから音声認識アプリを起動すれば、問い合わせによる推測をせず、**押した瞬間の正確なペインIDとHerdrセッションを渡せます**。

```text
Herdr内の録音キー
  ↓
HERDR_ACTIVE_PANE_ID=w1:p3
HERDR_SOCKET_PATH=/.../herdr.sock
  ↓
hiho-cli-audioへ「w1:p3を対象に録音開始」と通知
```

Windowsの場合も、WSL内のカスタムコマンドからWindowsの `hiho-cli-audio.exe` を起動できます。これはWSLの標準的な相互運用機能です。

ただし現在の `hiho-cli-audio` には、既に起動している常駐インスタンスへコマンドを送る仕組みがありません。`index.ts` にコマンドライン引数処理や単一インスタンス制御は存在しません。

ここはElectronの `app.requestSingleInstanceLock(additionalData)` と `second-instance` を使えば実装できます。新たに起動された短命な2個目のプロセスから、常駐中の1個目へJSONデータを渡せます。macOSでコマンドラインからアプリを再起動する場合にも、Electronは明示的な単一インスタンス制御を推奨しています。

## セッション管理で注意すべき点

Herdrを1セッションだけデフォルト設定で使っているなら、`herdr pane current` だけで足ります。

名前付きセッションや複数セッションを使う場合は、ペインIDだけでは不十分です。次のどちらかも保存します。

```text
--session <session-name>
```

または、

```text
HERDR_SOCKET_PATH=/path/to/herdr.sock
```

Herdrでは `HERDR_SOCKET_PATH` が正式なソケットオーバーライドとして扱われ、カスタムコマンドにも渡されます。CLIで明示した `--session` がある場合は、そちらが優先されます。

## `hiho-cli-audio` 側で特に重要な実装条件

現在のアプリは、音声認識ジョブを複数同時に処理できます。前の録音を認識中に次の録音を開始でき、認識結果の完了順も録音順とは限りません。したがって、単一の `lastHerdrPaneId` を持つ実装では誤送信します。

必ず次のように、録音セッション単位で保存する必要があります。

```text
session-A → w1:p3
session-B → w2:p1

session-Bが先に完了
  → w2:p1へ送る

session-Aが後で完了
  → w1:p3へ送る
```

既に `RecordingData` に `sessionId` があるため、この紐付けは自然に追加できます。

また、送信先ペインが認識中に閉じられた場合は、Herdrへの送信を失敗扱いにしつつ、現在と同様にクリップボードへ結果を残すのが妥当です。

## 改行の扱い

`pane send-text` は指定された文字列をそのままペインへ送ります。Enterを別途押す処理はありません。

ただし、認識結果そのものに `\n` や `\r` が入っている場合、それは端末アプリから見ると改行入力です。シェル上では未送信のコマンドを実行してしまう可能性があります。そのため、デフォルトでは次の正規化が安全です。

```ts
const textForPane = transcript.replace(/\r?\n/g, " ")
```

複数行入力を明示的に許可する設定が必要になった段階で、改行を保持するモードを追加する形がよいです。

## 判定

| 項目                             | 判定                    |
| ------------------------------ | --------------------- |
| macOSの音声認識アプリからmacOS上のHerdrへ送る | 可能                    |
| WindowsアプリからWSL上のHerdrへ送る      | `wsl.exe` 経由で可能       |
| iTerm2固有の連携                    | 不要                    |
| Windows Terminal固有の連携          | 不要                    |
| Herdr本体の変更                     | 不要                    |
| `hiho-cli-audio` の変更           | 必要                    |
| 録音開始時のペイン固定                    | 可能                    |
| 認識中に別ペインへ移動                    | 問題なし                  |
| 複数認識ジョブ                        | セッションごとに送信先を保存すれば対応可能 |

まず実装するなら、**現在のグローバルホットキーを維持し、録音開始時にmacOSではHerdr CLIを直接、Windowsでは `wsl.exe` 経由で `herdr pane current` を呼ぶ方式**が最小です。より厳密に「Herdr上で押したときだけ、そのペインへ送る」ことが必要になったら、Herdrのカスタムキーバインドからペイン情報を渡す方式へ移行できます。



これは音声認識の結果です。えっと、改用はそうですね、一旦なしでいい気がしますね。で、ハーダ、HERDR側からコマンドを送信する形にしたいです。で、その時の設計として、同じコマンドにしたいんですけれども、それ問題なくできそうでしょうか。あとショートカットキーコマンド同じにしたいんですよね。どれがアクティブになってても動くようにはしたいからって感じ。で、あと、ちなみにだからMacだと Command Shift、Commandプラス Shiftプラス D。Windowsだと Ctrl Shift Dですね。予定です。で、既存でターミナル側に、ターミナル側とかハーダ側にそれがあったらそっちは消すという前提にしましょうか。で、えっと、だから二重録音みたいにならないかどうか心配って感じですね。別に、なんか他の仕組みでもいいけど、例えば録音側は、なんだ、アプリ側がやるんだけれども、ハーダ側からどこに送信するかだけ送るみたいなのでもいいかもですけれども。順番とかがややこしそうですが。で、あとCLIの方もなんかセッション分けるのか、ターミナルセッションを用意するのかどうかもなんかCLIじゃないや、オーディオに、音声認識の方が、アプリの方もどうするのか議論が分かれそうですね。えっとブラウザ、ブラウザにカーソルが当たってるときはもちろんヒホCLIオーディオの方が発火するって感じですね。えっとハーダーの方ではなく。とりあえずだから録音中の時は録音中って表示できるようにしたいっていうのと、あと共通化もできる限りしたいっていう感じではあります。なんか設計をいろいろ考えてみてほしいです。



## 結論

設計としては、次の2点を分けるのが重要です。

* **録音を開始・停止する主体**
* **文字起こし結果の送信先を決める主体**

同じ `Command+Shift+D`／`Ctrl+Shift+D` を、hiho-cli-audio の `globalShortcut` とHerdrのキーバインドへ**同時に常時登録する設計は避けるべき**です。ElectronのグローバルショートカットはOSへ登録され、アプリにフォーカスがなくても発火します。端末までキーが届かない可能性がある一方、環境によって両方が発火すると二重トグルになります。

私なら、最初の実装は次の構成にします。

> **ショートカットと録音状態は常にhiho-cli-audioが一元管理し、録音開始時だけHerdrから現在ペインを取得する。**

これは厳密には「Herdrからアプリへ録音開始コマンドを送る」向きではなく、「アプリからHerdrへ送信先を問い合わせる」向きですが、利用者から見た挙動は同じで、二重録音を構造的に防げます。

---

# 推奨構成

```text
Command+Shift+D / Ctrl+Shift+D
                │
                ▼
       hiho-cli-audioだけが受信
                │
        現在は録音中か？
          ┌─────┴─────┐
        いいえ         はい
          │             │
          ▼             ▼
  入力先を判定       即座に録音停止
          │
   ┌──────┴──────┐
   │             │
Herdrが前面     それ以外
   │             │
Herdrの現在     clipboard
ペインを取得     target
   │
   └──────┬──────┘
          ▼
 targetを固定して録音開始
          │
          ▼
      文字起こし
          │
          ├─ クリップボードへコピー
          └─ Herdr targetなら保存済みペインへ送信
```

重要なのは、**送信先の判定は録音開始時だけ行う**ことです。

録音停止時に現在のペインを再取得してはいけません。録音開始後に別ペインやブラウザへ移動しても、最初に記録したペインへ送る必要があるためです。

---

## ブラウザ上で押した場合

ブラウザが前面なら、従来どおり次の挙動にします。

```text
グローバルショートカット
  → 録音開始
  → target = clipboard
  → 文字起こし完了
  → クリップボードへコピー
```

ブラウザ側に何か拡張機能を入れたり、ブラウザへキーを送ったりする必要はありません。

## Herdr上で押した場合

Herdrを表示している端末が前面なら、録音開始直前にHerdrへ現在ペインを問い合わせます。

macOSでは直接実行します。

```text
herdr pane current
```

WindowsではWindows上のElectronアプリからWSLへ問い合わせます。

```text
wsl.exe -d <distribution> -u <user> -- \
  /path/to/herdr pane current
```

WindowsとWSLは双方向に実行可能で、Windows側からは `wsl.exe` でLinuxコマンドを、WSL側からは `.exe` を付けてWindowsプログラムを起動できます。([Microsoft Learn][1])

文字起こし完了時には、保存しておいた条件で次を実行します。

```text
herdr pane send-text <saved-pane-id> <transcribed-text>
```

Herdrの `send-text` は対象ペインのPTYへ文字列を送ります。Enterは自動送信されないので、今回は文字起こし結果だけを入力欄へ置けます。

---

# 「Herdrが前面」をどう判定するか

ここだけOS別実装になります。

単に「iTerm2またはWindows Terminalが前面」だけで判定すると、同じ端末で通常のシェルを開いている場合までHerdr扱いになってしまいます。そこで、Herdrの外側ウィンドウタイトルに識別用の固定文字列を入れるのが扱いやすいです。

```toml
[ui]
window_title = "[HERDR] {workspace} — {tab}"
```

Herdrのタイトルテンプレートは固定文字列と `{hostname}`、`{workspace}`、`{tab}`、`{pane}`、`{terminal_title}` を組み合わせられます。

hiho-cli-audio側では、録音開始時に次を確認します。

```text
macOS:
  前面アプリ = iTerm2
  かつ前面ウィンドウタイトルに [HERDR]

Windows:
  前面プロセス = WindowsTerminal.exe
  かつ前面ウィンドウタイトルに [HERDR]
```

判定結果が不明、タイトルが取得できない、Herdr CLIがタイムアウトした、ペイン取得が失敗した場合は、**必ずclipboard targetへフォールバック**します。前回のペインを再利用してはいけません。古いペインへ誤送信する方が危険だからです。

この判定部分は `ForegroundContextService` として隔離します。

```ts
interface ForegroundContextService {
  getForegroundContext(): Promise<
    | { kind: 'herdr-terminal' }
    | { kind: 'other' }
    | { kind: 'unknown' }
  >
}
```

---

# アプリ内部の共通化

macOSとWindowsで異なるのは、Herdr CLIをどう実行するかだけです。

```ts
interface HerdrTransport {
  getCurrentPane(): Promise<HerdrTarget>
  sendText(target: HerdrTarget, text: string): Promise<void>
}
```

実装を2つ用意します。

```ts
class LocalHerdrTransport implements HerdrTransport {
  // macOS: herdrを直接execFile
}

class WslHerdrTransport implements HerdrTransport {
  // Windows: wsl.exe経由でherdrを実行
}
```

上位の録音処理から見ると同じです。

```ts
const target = await outputTargetResolver.resolveAtRecordingStart()
await recordingController.start(target)
```

したがって、音声録音、状態遷移、文字起こし、履歴、出力処理はすべて共通化できます。

---

# 録音セッションの持ち方

現在の `hiho-cli-audio` には既に録音ごとの `sessionId` があります。これに送信先を関連付けます。

```ts
type OutputTarget =
  | {
      kind: 'clipboard'
    }
  | {
      kind: 'herdr'
      paneId: string
      socketPath?: string
      herdrBinPath: string
      transport:
        | {
            kind: 'local'
          }
        | {
            kind: 'wsl'
            distribution: string
            user: string
          }
    }

interface RecordingSessionContext {
  sessionId: string
  target: OutputTarget
  startedAt: string
}
```

次のように、録音セッション単位で保持します。

```text
session A
  target = macOS Herdr / w1:p3

session B
  target = clipboard

session C
  target = WSL Ubuntu / w2:p1
```

文字起こしジョブは完了順が前後し得るため、`lastTarget` のような単一変数は使用できません。現在の実装も複数の文字起こしジョブを `activeJobIds` で並行管理しているので、各ジョブへ `RecordingSessionContext` を引き継ぐ形が自然です。

例えば次のように変更します。

```ts
submitRecordingData(
  recordingData: RecordingData,
  context: RecordingSessionContext
): void
```

---

# 状態機械

ここは二重録音防止の中心です。

現在の `AudioIpcHandler` は、停止中にもう一度開始要求が来ると `pendingStart` を立て、停止完了後に次の録音を開始します。また、開始処理中にトグルが来ると `stopAfterStart` を立てます。したがって、同じキー操作から2回トグルが届いた場合、

* 開始直後に停止する
* 停止後に意図しない次の録音が始まる

という挙動が起こり得ます。

ショートカット操作については、次の状態遷移に変える方が安全です。

| 現在状態                 | `toggle` を受けた場合 |
| -------------------- | --------------- |
| `not-ready` / `idle` | targetを取得して録音開始 |
| `starting`           | 同一録音を停止予約       |
| `recording`          | 同一録音を停止         |
| `stopping`           | 無視              |
| 文字起こし中のみ             | 新しい録音を開始可能      |

特に、`stopping` 中のトグルで次録音を予約する挙動は、グローバルショートカット経由では無効化するのがよいです。

さらに防御として、コマンドIDと短時間の重複除外を入れます。

```ts
interface ToggleCommand {
  version: 1
  commandId: string
  invokedAt: number
  source: 'global-shortcut' | 'herdr'
}
```

* 同じ `commandId` は一度しか処理しない
* 150〜250ミリ秒以内の連続トグルは重複として捨てる
* ただし本質的な対策は「ショートカット所有者を1つにする」こと

とします。

---

# 録音中表示

これは大部分が既にあります。

現在の状態型には、

```ts
kind: 'recording'
kind: 'transcribing'
kind: 'completed'
kind: 'failed'
```

が存在し、録音開始時には `recordingStartedAt` を設定して状態ウィンドウを表示しています。

したがって、Herdr対応を追加しても、グローバルショートカットと同じ `AudioIpcHandler`／`TranscriptionJobService` を通せば「録音中」はそのまま表示できます。

送信先を表示したければ、状態型を次のように拡張できます。

```ts
type RecordingTargetSummary =
  | { kind: 'clipboard' }
  | { kind: 'herdr'; paneId: string }

type StatusWindowState =
  | {
      kind: 'recording'
      recordingStartedAt: string
      processingJobCount: number
      target: RecordingTargetSummary
    }
  // ...
```

表示例は次の程度で十分です。

```text
録音中
入力先: Herdr w1:p3
```

または、

```text
録音中
入力先: クリップボード
```

---

# 文字起こし完了後の出力

今回は改行を入力しない方針なので、Herdrへ送る直前に正規化します。

```ts
function normalizeForInsertion(text: string): string {
  return text.replace(/\r\n|\r|\n/g, ' ')
}
```

履歴には元の文字起こしを保存し、実際の出力だけ正規化するのがよいです。

処理順は次を推奨します。

```text
1. 文字起こし成功
2. 正規化
3. クリップボードへコピー
4. targetがHerdrなら保存済みペインへ送信
5. 成否を状態ウィンドウへ表示
```

現在も文字起こし成功時にElectronのクリップボードへ書き込んでいます。

Herdrへの送信に失敗してもクリップボードには残るので、結果を失いません。

成功表示は分けます。

```text
Herdrに入力しました
```

失敗時は、

```text
Herdrへの入力に失敗しました
クリップボードにコピーしました
```

とします。

---

# ショートカットの既存競合

## macOS／iTerm2

iTerm2の `Command+Shift+D` は、デフォルトではペインの水平分割です。削除または別キーへ変更する必要があります。([iTerm2][2])

ただし、推奨構成ではhiho-cli-audioのグローバルショートカットが物理キーを一元管理するため、Herdrへ `cmd+shift+d` を直接送る必要はありません。

これは重要です。Herdrは `cmd`／`super` のキーバインド構文自体には対応していますが、外側の端末がその修飾キーをHerdrまで伝えるかは端末依存です。Herdr自身のドキュメントも、`cmd/super` は端末設定に依存するとしています。

## Windows／Windows Terminal

Windows Terminalの `Ctrl+Shift+D` は、現在のデフォルト設定では「タブを複製」です。([GitHub][3])

設定から解除します。

```json
{
  "keybindings": [
    {
      "keys": "ctrl+shift+d",
      "id": null
    }
  ]
}
```

Windows Terminalでは `id: null` または `unbound` にすることで、キーを下位の端末アプリへ渡せます。([GitHub][4])

推奨構成ではグローバルショートカットが処理するので通常はWindows Terminalまで到達しませんが、hiho-cli-audioが未起動だった場合やショートカット登録に失敗した場合にタブが複製されないよう、解除しておく意味があります。

## Herdr

Herdrのデフォルトには直接の `ctrl+shift+d` はありません。`prefix+shift+d` はワークスペースを閉じる操作ですが、これは先にprefixを押す別のキー列です。

既にユーザー設定の `[[keys.command]]` で同じ直接キーを使っている場合だけ削除します。

---

# 厳密に「Herdr側からコマンドを送る」場合

これは第2案として実現できます。

Herdr設定は次の形です。

```toml
[[keys.command]]
key = "ctrl+shift+d"
type = "shell"
command = "hiho-audioctl herdr-toggle"
description = "toggle voice recording"
```

macOSとWSLの両方に `hiho-audioctl` という同名ラッパーを置けば、**command文字列は完全に同じ**にできます。

Herdrの `type = "shell"` はバックグラウンド実行なので、専用ペインやターミナルセッションは作られません。また、コマンドには以下が渡されます。

* `HERDR_ACTIVE_PANE_ID`
* `HERDR_SOCKET_PATH`
* `HERDR_BIN_PATH`
* `HERDR_ACTIVE_WORKSPACE_ID`
* `HERDR_ACTIVE_TAB_ID`

したがって、問い合わせなしで録音開始時の正確なペインとHerdrソケットを取得できます。

ラッパーから既に起動しているElectronアプリへコマンドを渡すには、Electronの単一インスタンス機能を使えます。

```ts
const gotLock = app.requestSingleInstanceLock(controlRequest)

if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, _argv, _cwd, additionalData) => {
    controlCommandRouter.dispatch(additionalData)
  })
}
```

`requestSingleInstanceLock(additionalData)` は、2個目のプロセスから既存の1個目へJSONデータを送れます。macOSではコマンドラインから起動した場合にOSの通常の単一インスタンス制御を迂回するため、この処理が特に必要です。

WSL側ラッパーはWindows版exeを起動します。

```bash
hiho-cli-audio.exe --control-base64 '<payload>'
```

macOS側ラッパーはアプリバンドル内の実行ファイルを起動します。

```bash
/Applications/hiho-cli-audio.app/Contents/MacOS/hiho-cli-audio \
  --control-base64 '<payload>'
```

ただし、この構成で同じ物理ショートカットをブラウザでも使うには、hiho-cli-audioのグローバルショートカットを、

* Herdrが前面のとき：解除
* それ以外のとき：登録

と切り替えなければなりません。

現在使用しているElectron 38.2.2のAPIでは `register`／`unregister` を使う形になります。プロジェクトもElectron 38.2.2を固定しています。

これは前面ウィンドウ監視、登録切り替えの競合、iTerm2のCommandキー変換などが増えるため、最初から選ぶには複雑です。

---

# 案の比較

| 案                               |   二重録音 | ブラウザ対応 | Herdrペイン精度 |   実装量 |
| ------------------------------- | -----: | -----: | ---------: | ----: |
| ElectronとHerdrに同じキーを常時二重登録      |     危険 |     対応 |        不安定 |     小 |
| **アプリがキーを一元管理し、Herdrへ問い合わせる**   | **なし** | **対応** |         高い |     中 |
| Herdr前面時だけグローバル登録を解除            |     低い |     対応 |      非常に高い |     大 |
| 外部のAutoHotkey／Hammerspoon等で振り分け |     低い |     対応 |         高い | 大・OS別 |

## 推奨する最終設計

最初は次で固めるのが妥当です。

1. `Command+Shift+D`／`Ctrl+Shift+D` はhiho-cli-audioだけがグローバル登録する。
2. iTerm2とWindows Terminalの同じデフォルトキーバインドは解除する。
3. 録音開始時に前面ウィンドウを判定する。
4. `[HERDR]` タイトルの端末なら、macOSでは直接、WindowsではWSL経由で `herdr pane current` を実行する。
5. `sessionId` ごとに送信先を固定する。
6. 録音停止時には送信先を再判定しない。
7. 文字起こし結果は改行を空白化する。
8. クリップボードへ必ず保存し、Herdr targetなら追加で `pane send-text` する。
9. 専用のターミナルペイン、常駐CLI、別の音声認識プロセスは作らない。

この構成なら、利用時のキーは完全に共通で、録音表示も現在の実装を再利用でき、二重録音の入口自体をなくせます。Herdr側からのpush方式は、複数の名前付きHerdrセッションを自動識別する必要が出た段階で追加するのが適切です。

[1]: https://learn.microsoft.com/en-us/windows/wsl/filesystems "https://learn.microsoft.com/en-us/windows/wsl/filesystems"
[2]: https://iterm2.com/documentation/2.1/documentation-one-page.html "https://iterm2.com/documentation/2.1/documentation-one-page.html"
[3]: https://raw.githubusercontent.com/microsoft/terminal/main/src/cascadia/TerminalSettingsModel/defaults.json "https://raw.githubusercontent.com/microsoft/terminal/main/src/cascadia/TerminalSettingsModel/defaults.json"
[4]: https://github.com/MicrosoftDocs/terminal/blob/main/TerminalDocs/customize-settings/actions.md "https://github.com/MicrosoftDocs/terminal/blob/main/TerminalDocs/customize-settings/actions.md"
