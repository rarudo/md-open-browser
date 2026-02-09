---
description: tmuxキャッチアップUIの要件定義
---
# tmuxキャッチアップUI

ブラウザ上のマークダウンプレビューから、tmux上で動作しているClaude Codeに質問を送信し、その応答を確認するための機能。Claude Codeがtmux環境で起動され、--tmux-paneオプションまたは--use-claude-codeオプションでペイン情報が渡された場合にのみ有効化される。

関連: [design](design.md)

## EARS記法パターン

| パターン | 構文 | 用途 |
|---------|------|------|
| Event-Driven | When [イベント], the [システム] shall [アクション] | イベント発生時の動作 |
| State-Driven | While [状態], the [システム] shall [アクション] | 特定状態中の動作 |
| Unwanted | If [トリガー], the [システム] shall [アクション] | 異常系・エラー処理 |
| Optional | Where [機能], the [システム] shall [アクション] | オプション機能 |
| Ubiquitous | The [システム] shall [アクション] | 常に適用される動作 |

## 1. CLIオプション

**目的**: Claude Codeユーザーとして、tmuxペイン情報をmd-openに渡したい。それにより、md-openがClaude Codeのペインと通信できるようになる。

### 受け入れ基準

1.1 Where `--tmux-pane <pane_id>` オプションが指定された場合, the システムは指定されたペインIDをサーバーに渡してキャッチアップ機能を有効化するものとする

1.2 When `--tmux-pane` オプションが指定されていない場合, the システムはキャッチアップ機能を無効化し、関連するUI要素を一切表示しないものとする

1.3 The システムは `--tmux-pane` オプションで受け取ったペインIDを `ServerOptions.tmuxPane` プロパティとして `startServer` 関数に渡すものとする

1.4 When `--help` オプションが指定された場合, the ヘルプメッセージに `--tmux-pane <pane_id>` および `--use-claude-code` オプションの説明を含むものとする

1.5 Where `--use-claude-code` オプションが指定された場合, the システムは環境変数 `TMUX_PANE` からペインIDを取得し、`--tmux-pane` と同等にキャッチアップ機能を有効化するものとする

1.6 If `--use-claude-code` オプションが指定されたが環境変数 `TMUX_PANE` が未設定の場合, the システムは警告メッセージ `Warning: TMUX_PANE environment variable is not set. Catchup UI disabled.` を出力し、キャッチアップ機能を無効のまま起動するものとする

1.7 If `--tmux-pane` と `--use-claude-code` の両方が指定された場合, the システムは `--tmux-pane` の値を優先するものとする

## 2. tmux APIエンドポイント

**目的**: ブラウザクライアントとして、サーバー経由でtmuxペインと通信したい。それにより、ブラウザ上からClaude Codeへの質問送信とペイン内容の閲覧が可能になる。

### 受け入れ基準

2.1 When `GET /api/tmux/status` リクエストを受信した場合, the サーバーはtmux連携の状態をJSONで返却するものとする
  - レスポンス形式: `{ "enabled": boolean, "paneId": string | null }`
  - Content-Type: `application/json; charset=utf-8`
  - ステータスコード: 200

2.2 When `GET /api/tmux/pane` リクエストを受信し、tmux連携が有効な場合, the サーバーは `tmux capture-pane -t <paneId> -p -S -100` コマンドを実行し、ペインの最新100行をプレーンテキストで返却するものとする
  - Content-Type: `text/plain; charset=utf-8`
  - ステータスコード: 200

2.3 When `POST /api/tmux/send` リクエストを受信し、tmux連携が有効な場合, the サーバーはリクエストボディの `text` フィールドの内容を `tmux send-keys -t <paneId>` コマンドで指定ペインに送信し、Enterキーも送信するものとする
  - リクエスト形式: `{ "text": string }`
  - Content-Type: `application/json`
  - レスポンス: `{ "success": true }`
  - ステータスコード: 200

2.4 If tmux連携が無効（--tmux-pane未指定）の状態で `/api/tmux/pane` または `/api/tmux/send` にリクエストを受信した場合, the サーバーはステータスコード404を返却するものとする

2.5 The サーバーは `tmux send-keys` に渡すテキストから制御文字（`\x00`-`\x08`, `\x0b`, `\x0c`, `\x0e`-`\x1f`）を除去するものとする

2.6 If `POST /api/tmux/send` のリクエストボディが10KBを超えた場合, the サーバーはエラーを返却するものとする

2.7 If `POST /api/tmux/send` のリクエストボディに `text` フィールドが存在しない、または文字列でない場合, the サーバーはステータスコード400を返却するものとする

2.8 The サーバーは全てのtmuxコマンド実行に5秒のタイムアウトを設定するものとする

2.9 If `tmux capture-pane` コマンドの実行に失敗した場合, the サーバーはエラーメッセージ文字列 `[Error: Failed to capture tmux pane content]` をレスポンスとして返却するものとする

2.10 If `tmux send-keys` コマンドの実行に失敗した場合, the サーバーはステータスコード500を返却するものとする

## 3. キャッチアップパネルUI

**目的**: ユーザーとして、マークダウンプレビューを見ながらClaude Codeに質問を送信し応答を確認したい。それにより、仕様書レビュー中に画面を切り替えずにフィードバックできる。

### 受け入れ基準

3.1 Where tmux連携が有効な場合, the システムはマークダウンプレビュー領域（.content）の下部にキャッチアップパネルを表示するものとする

3.2 The キャッチアップパネルは上部にヘッダー（タイトル「Claude Code Catchup」と折りたたみトグルボタン）を持つものとする

3.3 The キャッチアップパネルはヘッダー下部にペイン出力表示領域（`<pre>`要素）を持つものとする

3.4 The キャッチアップパネルは最下部に複数行テキスト入力フィールド（`<textarea>`）とSendボタンを持つものとする

3.5 When Sendボタンがクリックされた場合、またはテキスト入力フィールドでEnterキーが押された場合（IME変換中およびShift+Enter押下時を除く）, the システムは入力テキストを `POST /api/tmux/send` で送信し、入力フィールドをクリアするものとする

3.15 While IMEで変換中（`isComposing === true`）の間, the システムはEnterキーによるテキスト送信を行わないものとする（変換確定の誤送信防止）

3.16 When テキスト入力フィールドでShift+Enterが押された場合, the システムは送信せず改行を挿入するものとする

3.17 The テキスト入力フィールドはデフォルト高さ1行で表示し、入力内容に応じて最大4行まで自動拡張するものとする

3.18 When テキスト入力フィールドの内容がクリアされた場合, the フィールドの高さはデフォルト（1行）にリセットされるものとする

3.6 When キャッチアップパネルが展開状態の場合, the システムは2秒間隔で `GET /api/tmux/pane` をポーリングし、ペイン出力表示領域を更新するものとする

3.7 When ペイン出力が更新された場合, the システムはペイン出力表示領域を最下部に自動スクロールするものとする

3.8 When キャッチアップパネルのヘッダーがクリックされた場合, the システムはパネルの本体部分（出力表示+入力エリア）の表示/非表示を切り替えるものとする

3.9 When キャッチアップパネルが折りたたまれた場合, the システムはポーリングを停止するものとする

3.10 When キャッチアップパネルが展開された場合, the システムはポーリングを再開するものとする

3.11 While テキスト送信中の間, the システムは入力フィールドとSendボタンを無効化するものとする

3.12 The ペイン出力表示領域は `textContent` プロパティを使用してテキストを表示し、`innerHTML` を使用しないものとする（XSS防止）

3.13 The キャッチアップパネルの最大高さはビューポート高さの50%を超えないものとする

3.14 Where tmux連携が無効な場合, the キャッチアップパネルのHTML要素は `display: none` のままとし、DOM上に存在するがユーザーには見えないものとする

## 4. レイアウト調整

**目的**: 開発者として、キャッチアップパネル追加後も既存のマークダウンプレビューが正常に動作することを保証したい。

### 受け入れ基準

4.1 The `.content` 要素は `display: flex; flex-direction: column` を使用して、マークダウンプレビューとキャッチアップパネルを縦に配置するものとする

4.2 The `.markdown-body` 要素は `flex: 1; overflow-y: auto` を設定し、キャッチアップパネルの有無にかかわらず残りスペースを占有してスクロール可能とするものとする

4.3 When tmux連携が無効でキャッチアップパネルが非表示の場合, the マークダウンプレビューのレイアウトは既存の表示と同一であるものとする

4.4 The キャッチアップパネルのスタイルは既存のダークテーマ配色（背景: `#161b22`、ヘッダー: `#21262d`、テキスト: `#e6edf3`、ボーダー: `#30363d`）に統一するものとする

4.5 While tmuxポーリングによりペイン出力表示領域の内容が更新された場合, the マークダウンプレビュー領域（`.markdown-body`）のスクロール位置は変化しないものとする

4.6 The キャッチアップパネルのペイン出力表示領域（`.tmux-output`）は固定高さを使用し、内容量の変化によってパネル全体のサイズが変動しないものとする

## 5. Webターミナルエミュレーション（ttyd統合）

**目的**: ユーザーとして、ブラウザ上でtmuxペインの完全なターミナル表示（ANSIカラー、カーソル移動、入力操作）を行いたい。それにより、マークダウンプレビューを見ながらターミナルと同等の操作体験が得られる。

### 受け入れ基準

5.1 Where `--tmux-pane` または `--use-claude-code` オプションが有効な場合, the システムは ttyd を子プロセスとして起動し、指定されたtmuxペインが属するセッションにアタッチするものとする

5.2 The システムはttydの起動ポートをmd-open-browserのポート+1とするものとする

5.3 If ttydコマンドがPATH上に存在しない場合, the システムは警告メッセージ `Warning: ttyd not found. Falling back to text-based catchup UI.` を出力し、既存のプレーンテキスト方式にフォールバックするものとする

5.4 When md-open-browserプロセスが終了（SIGINT等）した場合, the システムはttyd子プロセスも終了させるものとする

5.5 The `GET /api/tmux/status` レスポンスに `ttydUrl` フィールド（string | null）を追加し、ttydが有効な場合はttydのURL（例: `http://localhost:3001`）を返却するものとする

5.6 Where ttydが有効な場合, the キャッチアップパネルの出力表示領域と入力フィールドをiframeに置き換え、ttydのWebUIを表示するものとする

5.7 The ttyd iframeは既存のキャッチアップパネルのレイアウト内に収まり、パネルの折りたたみ・展開操作はiframeに対しても正常に機能するものとする

5.8 Where ttydが有効な場合, the システムは `/api/tmux/pane`（GET）と `/api/tmux/send`（POST）のポーリング・送信処理を行わないものとする（ttydが双方向通信を直接提供するため）

5.9 If ttyd子プロセスが異常終了した場合, the システムはコンソールにエラーメッセージを出力するものとする

5.10 The ttydはreadonlyモード（`-R`）を使用せず、ユーザーがブラウザ上から直接ターミナルに入力できるようにするものとする

5.11 The ttyd起動時にtmuxペインIDから所属セッションを `tmux display-message -p -t <paneId> "#{session_name}"` で取得し、`tmux attach-session -t <session>` を実行するものとする

5.12 If ttydの起動ポートが使用中の場合, the システムはポートをインクリメントして再試行するものとする（最大10回）
