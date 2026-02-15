---
description: tmuxキャッチアップUIの技術設計
---
# tmuxキャッチアップUI 設計

関連: [requirements](requirements.md)

## 概要
**目的**: この機能はClaude Codeユーザーに、ブラウザ上のマークダウンプレビューからtmux上のClaude Codeへ直接質問を送信し、応答を確認できる価値を提供します。
**ユーザー**: Claude Codeをtmux環境で使用する開発者が、仕様書レビュー中に疑問点を即座にClaude Codeへフィードバックするためにこれを利用します。
**影響**: CLI引数解析、HTTPサーバーAPI、フロントエンドUIへの拡張を行います。

## ゴール
- ブラウザUIからtmux上のClaude Codeにテキスト入力を送信できる
- Claude Codeペインの出力内容をブラウザ上でプレーンテキストとして閲覧できる
- tmux環境以外では一切の影響がない（オプトイン方式）

## 非ゴール
- ~~ANSIカラーコードの再現（プレーンテキスト表示のみ）~~ → 決定9でttyd統合により解決
- ~~xterm.jsなどの本格的なターミナルエミュレーション~~ → 決定9でttyd統合により解決
- WebSocketによるリアルタイム通信（自前実装としては非ゴール。ttydが内部で使用）
- tmuxセッションやウィンドウの管理操作
- 認証や権限管理（ローカル環境での使用を前提）

## アーキテクチャ

### アーキテクチャパターンと境界マップ

```mermaid
flowchart TB
    subgraph CLI["CLIレイヤー"]
        Entry["index.ts<br>--tmux-pane オプション"]
    end
    subgraph Server["サーバーレイヤー"]
        HTTP["server.ts<br>HTTPサーバー"]
        TmuxHelper["tmuxヘルパー関数<br>execSync"]
        ExistingAPI["既存API<br>/api/files"]
        TmuxAPI["tmux API<br>/api/tmux/*"]
    end
    subgraph External["外部プロセス"]
        Tmux["tmux<br>send-keys / capture-pane"]
        ClaudeCode["Claude Code<br>tmuxペイン上"]
    end
    subgraph Client["ブラウザ"]
        Preview["マークダウンプレビュー"]
        CatchupPanel["キャッチアップパネル<br>下部折りたたみ"]
    end
    Entry -->|tmuxPane| HTTP
    HTTP --> ExistingAPI
    HTTP --> TmuxAPI
    TmuxAPI --> TmuxHelper
    TmuxHelper -->|child_process.execSync| Tmux
    Tmux -->|send-keys| ClaudeCode
    Tmux -->|capture-pane| TmuxHelper
    Client --> ExistingAPI
    Client --> TmuxAPI
    Preview --> Client
    CatchupPanel --> Client
```

**アーキテクチャ統合**:
- 選択されたパターン: 既存HTTPサーバーにAPIエンドポイントを追加し、child_process.execSyncでtmuxコマンドを実行する
- ドメイン/機能境界: CLIはtmuxペイン情報の受け渡し、Serverはtmuxコマンド実行のプロキシ、Clientはキャッチアップ操作UI
- 保持される既存パターン: HTTPサーバー、静的ファイル配信、CLIオプション解析
- 新規コンポーネントの根拠: tmuxヘルパー関数（コマンド実行の安全な抽象化）、キャッチアップパネル（専用UI）

### 技術スタック

| レイヤー | 選択/バージョン | 機能における役割 | 備考 |
|--------|---------------|----------------|-----|
| CLIオプション | util.parseArgs | --tmux-paneオプション解析 | 既存の仕組みに追加 |
| tmux連携 | child_process.execSync | tmuxコマンド実行 | Node.js標準API、外部依存なし |
| HTTPサーバー | http標準モジュール | tmux APIエンドポイント | 既存サーバーに追加 |
| フロントエンド | vanilla JS | キャッチアップパネルUI | 追加ライブラリなし |

## システムフロー

### 質問送信フロー

```mermaid
sequenceDiagram
    participant User as ユーザー
    participant Browser as ブラウザ
    participant Server as サーバー
    participant Tmux as tmux
    participant CC as Claude Code

    User->>Browser: テキスト入力 + Enter/Sendクリック
    Browser->>Server: POST /api/tmux/send {text}
    Server->>Server: sanitizeTmuxInput(text)
    Server->>Tmux: tmux send-keys -t <paneId> "text" Enter
    Tmux->>CC: キー入力として送信
    Server-->>Browser: {success: true}
    Browser->>Browser: 入力フィールドクリア
```

### ペイン内容取得フロー（ポーリング）

```mermaid
sequenceDiagram
    participant Browser as ブラウザ
    participant Server as サーバー
    participant Tmux as tmux

    loop 2秒間隔
        Browser->>Server: GET /api/tmux/pane
        Server->>Tmux: tmux capture-pane -t <paneId> -p -S -100
        Tmux-->>Server: テキスト内容
        Server-->>Browser: text/plain レスポンス
        Browser->>Browser: #tmux-output.textContent更新
        Browser->>Browser: 自動スクロール（最下部）
    end
```

### 初期化フロー

```mermaid
sequenceDiagram
    participant Browser as ブラウザ
    participant Server as サーバー

    Browser->>Server: GET /api/tmux/status
    Server-->>Browser: {enabled: true/false, paneId: "..."}
    alt enabled === true
        Browser->>Browser: #tmux-panel を表示
        Browser->>Browser: ポーリング開始
    else enabled === false
        Browser->>Browser: UIは非表示のまま
    end
```

## 要件トレーサビリティ

| 要件 | 概要 | コンポーネント | インターフェース |
|------|------|--------------|----------------|
| 1.1 | --tmux-paneオプション | index.ts | parseOptions() |
| 1.2 | オプション未指定時のUI非表示 | app.js | initTmuxCatchup() |
| 1.3 | ペイン情報のサーバー受け渡し | index.ts, server.ts | ServerOptions.tmuxPane |
| 1.5-1.7 | --use-claude-codeオプション | index.ts | parseOptions(), main() |
| 2.1 | tmuxステータスAPI | server.ts | GET /api/tmux/status |
| 2.2 | ペイン内容取得API | server.ts | GET /api/tmux/pane |
| 2.3 | テキスト送信API | server.ts | POST /api/tmux/send |
| 2.4-2.6 | 入力サニタイズ・エラー処理 | server.ts | sanitizeTmuxInput(), parseTmuxRequestBody() |
| 3.1 | キャッチアップパネル配置 | index.html, styles.css | .tmux-panel |
| 3.2, 3.15 | テキスト入力・送信UI（IME対応） | index.html, app.js | #tmux-input, #tmux-send, isComposing |
| 3.3 | ペイン出力表示 | app.js | fetchTmuxPaneContent() |
| 3.4 | ポーリング制御 | app.js | startTmuxPolling(), stopTmuxPolling() |
| 3.5 | パネル折りたたみ | styles.css, app.js | .tmux-panel-body.collapsed |
| 3.6 | 自動スクロール | app.js | scrollTop = scrollHeight |
| 3.16-3.18 | 複数行入力対応 | index.html, styles.css, app.js | textarea#tmux-input |
| 4.5-4.6 | スクロール位置保持 | styles.css | .tmux-output height固定 |

## コンポーネントとインターフェース

### CLIレイヤー

#### src/index.ts（変更）

| フィールド | 詳細 |
|----------|------|
| 意図 | --tmux-pane CLIオプションの追加とサーバーへの受け渡し |
| 要件 | 1.1, 1.3 |

**責任と制約**
- `--tmux-pane <pane_id>` オプションを解析
- ペイン情報をServerOptionsに含めてstartServerに渡す

**依存関係**
- インバウンド: ユーザー入力（CLI引数）
- アウトバウンド: server.ts -- ServerOptions.tmuxPane

**メソッド一覧**

| メソッドシグネチャ | 概要 | パラメータ | 戻り値 |
|------------------|------|----------|-------|
| `parseOptions(args: string[]): Options` | 引数解析（tmuxPane追加） | args: CLI引数 | Options（tmuxPane含む） |

### サーバーレイヤー

#### src/server.ts（変更）

| フィールド | 詳細 |
|----------|------|
| 意図 | tmux APIエンドポイントの提供とtmuxコマンドの安全な実行 |
| 要件 | 2.1-2.6 |

**責任と制約**
- tmux APIエンドポイント3つを提供
- tmuxコマンドをchild_process.execSyncで実行
- 入力のサニタイズとボディサイズ制限

**依存関係**
- インバウンド: index.ts -- ServerOptions.tmuxPane、ブラウザ -- HTTP API
- アウトバウンド: tmuxプロセス -- execSync

**メソッド一覧**

| メソッドシグネチャ | 概要 | パラメータ | 戻り値 |
|------------------|------|----------|-------|
| `sanitizeTmuxInput(text: string): string` | 制御文字除去 | text: ユーザー入力 | サニタイズ済みテキスト |
| `tmuxCapturePaneContent(paneId: string): string` | ペイン内容取得 | paneId: tmuxペインID | ペインのテキスト内容 |
| `tmuxSendKeys(paneId: string, text: string): void` | テキスト送信 | paneId, text | なし |
| `parseTmuxRequestBody(req: IncomingMessage): Promise<string>` | POSTボディ解析 | req: HTTPリクエスト | ボディ文字列 |

### フロントエンドレイヤー

#### public/app.js（変更）

| フィールド | 詳細 |
|----------|------|
| 意図 | キャッチアップパネルのUI制御（初期化、ポーリング、送信、折りたたみ） |
| 要件 | 3.1-3.6 |

**責任と制約**
- /api/tmux/statusの確認とパネル表示/非表示制御
- 2秒間隔のポーリングによるペイン内容取得
- テキスト送信とUI状態管理
- パネル折りたたみ時のポーリング停止

**メソッド一覧**

| メソッドシグネチャ | 概要 | パラメータ | 戻り値 |
|------------------|------|----------|-------|
| `initTmuxCatchup(): Promise<void>` | tmux機能の初期化 | なし | void |
| `setupTmuxEventListeners(): void` | イベントリスナー設定 | なし | void |
| `sendTmuxMessage(): Promise<void>` | テキスト送信 | なし | void |
| `fetchTmuxPaneContent(): Promise<void>` | ペイン内容取得・表示 | なし | void |
| `startTmuxPolling(): void` | ポーリング開始 | なし | void |
| `stopTmuxPolling(): void` | ポーリング停止 | なし | void |

### クラス構造図

```mermaid
classDiagram
    class Options {
        +string[] files
        +number port
        +boolean noOpen
        +boolean help
        +boolean version
        +string? tmuxPane
    }
    class ServerOptions {
        +number port
        +string? tmuxPane
    }
    class TmuxStatus {
        +boolean enabled
        +string? paneId
    }
    class TmuxSendRequest {
        +string text
    }
    Options --> ServerOptions : creates
    ServerOptions --> TmuxStatus : determines
```

## データモデル

### TmuxStatus（APIレスポンス）

| フィールド | 詳細 |
|----------|------|
| 意図 | tmux連携の有効状態をフロントエンドに通知 |
| 要件 | 2.1 |

**フィールド定義**

| フィールド名 | 型 | 説明 |
|------------|---|-----|
| enabled | boolean | tmux連携が有効かどうか |
| paneId | string / null | tmuxペインID（無効時null） |

### TmuxSendRequest（APIリクエスト）

| フィールド | 詳細 |
|----------|------|
| 意図 | ブラウザからClaude Codeへ送信するテキスト |
| 要件 | 2.3 |

**フィールド定義**

| フィールド名 | 型 | 説明 |
|------------|---|-----|
| text | string | 送信するテキスト |

## エラー処理

### エラーカテゴリと対応
- **ユーザーエラー**: textフィールド未指定 -> 400レスポンス
- **システムエラー**: tmuxコマンド実行失敗 -> エラーメッセージ返却（ペイン取得時）/ 500レスポンス（送信時）
- **設定エラー**: tmux-pane未指定でtmux APIアクセス -> 404レスポンス

## コーディングパターン

### tmuxコマンド実行パターン
```typescript
import { execSync } from "child_process";

// ペイン内容取得
function tmuxCapturePaneContent(paneId: string): string {
  try {
    return execSync(
      `tmux capture-pane -t ${JSON.stringify(paneId)} -p -S -100`,
      { encoding: "utf-8", timeout: 5000 }
    );
  } catch {
    return "[Error: Failed to capture tmux pane content]";
  }
}
```

### 入力サニタイズパターン
```typescript
// 制御文字（タブ・改行以外）を除去
function sanitizeTmuxInput(text: string): string {
  return text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
}
```

### POSTリクエストボディ解析パターン
```typescript
function parseTmuxRequestBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
      if (body.length > 10240) reject(new Error("Request body too large"));
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}
```

## テスト戦略

### テスト種類の選定

| 対象 | テスト種類 | 理由 |
|-----|----------|-----|
| parseOptions(tmux-pane) | ユニットテスト | 純粋な引数解析のため |
| GET /api/tmux/status | 統合テスト | APIレスポンスの確認 |
| tmux無効時の404 | 統合テスト | エラーハンドリングの確認 |
| capture-pane/send-keys | 手動テスト | 実際のtmux環境が必要 |

### ユニットテスト
- parseOptions: --tmux-paneオプションの解析を検証
- parseOptions: --tmux-pane未指定時のundefinedを検証

### 統合テスト
- GET /api/tmux/status: tmux有効時のレスポンス確認
- GET /api/tmux/status: tmux無効時のレスポンス確認
- GET /api/tmux/pane: tmux無効時の404確認
- POST /api/tmux/send: tmux無効時の404確認

### 手動確認項目
- tmux環境でmd-open --tmux-pane起動時にキャッチアップパネルが表示される
- テキスト入力がClaude Codeペインに送信される
- ペインの出力がブラウザに表示される
- パネル折りたたみ時にポーリングが停止する
- tmux-pane未指定時にパネルが表示されない

## 影響範囲

| 影響を受ける機能 | 影響の内容 | 影響レベル | 軽減策 |
|----------------|----------|----------|-------|
| マークダウンプレビュー | .contentにflex-direction: column追加 | 中 | .markdown-bodyにflex: 1とoverflow-y: auto追加で従来表示を維持 |
| CLIオプション解析 | --tmux-pane、--use-claude-codeオプション追加 | 低 | 既存オプションに影響しない追加のみ |
| HTTPサーバー | /api/tmux/* エンドポイント追加 | 低 | 既存エンドポイントに影響しない追加のみ |
| キャッチアップパネル入力 | input→textarea変更 | 中 | 既存の送信・IME対応ロジックを維持しつつ要素変更 |
| キャッチアップパネル出力 | .tmux-output高さ固定化 | 低 | 既にmax-height: 300pxの制約あり、固定化による視覚的な変化は最小限 |

## 注意事項

| カテゴリ | 注意点 | 詳細説明 | 防止策 |
|--------|-------|---------|-------|
| セキュリティ | コマンドインジェクション | tmux send-keysに渡すテキストの安全性 | JSON.stringifyでクォート、制御文字除去 |
| セキュリティ | XSS | capture-pane出力のブラウザ表示 | textContent使用（innerHTML不使用） |
| セキュリティ | DoS | 大きなリクエストボディ | 10KBサイズ制限 |
| パフォーマンス | ポーリング負荷 | 2秒間隔のHTTPリクエスト | パネル折りたたみ時はポーリング停止 |
| パフォーマンス | execSyncブロッキング | tmuxコマンド実行中のイベントループブロック | 5秒タイムアウト設定（tmuxコマンドは通常ミリ秒単位で完了） |
| 互換性 | tmux未インストール環境 | tmuxコマンドが見つからない場合のエラー | --tmux-paneオプション未指定時は一切のtmux操作を行わない |
| テスト | CI環境でのtmux不在 | tmuxがインストールされていないCI環境 | tmux依存テストはステータスAPIと404レスポンスのみ |

---

## 追加設計決定（v2）

### 決定6: --use-claude-codeオプションによる環境変数からのペインID自動取得

**What**: `--use-claude-code` booleanオプションを追加し、環境変数 `TMUX_PANE` からペインIDを自動取得する

**How**:
- ファイル: `src/index.ts`
- 実装方針: `parseOptions` に `--use-claude-code` を追加。`main` 関数で `--tmux-pane` が未指定かつ `--use-claude-code` が有効な場合に `process.env.TMUX_PANE` を使用

**Why（Core）**:

なぜこのアプローチ？
→ `--tmux-pane $TMUX_PANE` と毎回入力するのは冗長。booleanフラグ一つで環境変数から自動取得する方がユーザー体験が良い

なぜ `--use-claude-code` という名前？
→ tmuxペインの自動設定に限らず、将来的にClaude Code連携全般を示すフラグとして拡張可能。また、ユーザーがClaude Codeと併用する意図を明示できる

なぜ `--tmux-pane` を優先？
→ 明示的な指定は暗黙のデフォルトに勝る原則。ユーザーが特定ペインを指定したい場合にオーバーライドできるようにする

**検討した選択肢**:
- **booleanフラグ `--use-claude-code`（採用）**: シンプルで拡張性がある
- **`--tmux-pane` のデフォルト値を `$TMUX_PANE` に変更（却下）**: 意図せずtmux機能が有効化される可能性がありオプトイン原則に反する
- **`--tmux-pane auto` のような特殊値（却下）**: stringオプションの値に特殊な意味を持たせると解析が複雑になる

**トレードオフ**:
- 利点: ユーザーは `--use-claude-code` だけでtmux連携が有効化される
- 妥協: 新しいCLIオプションが1つ増える

### 決定7: テキスト入力フィールドの複数行対応

**What**: 入力フィールドを `<input type="text">` から `<textarea>` に変更し、複数行入力を可能にする

**How**:
- ファイル: `public/index.html`, `public/styles.css`, `public/app.js`
- 実装方針: HTMLの `<input>` を `<textarea>` に変更。CSSで初期高さ1行・最大4行のサイズ制御。JSで入力内容に応じた自動高さ調整とShift+Enterでの改行サポート

**Why（Core）**:

なぜ `<textarea>` ？
→ HTMLの仕様上、`<input type="text">` は単一行のみ対応。複数行入力には `<textarea>` が標準的な選択

なぜ自動拡張方式？
→ 固定の大きなテキストエリアはスペースの無駄になる。1行から最大4行まで自動拡張することで、通常時はコンパクト、長文入力時は十分な編集領域を提供

なぜEnterで送信、Shift+Enterで改行？
→ チャットUIの標準的な操作パターン。Slack、Discord等の既存ツールとの一貫性

**検討した選択肢**:
- **textarea + 自動拡張（採用）**: 直感的で標準的
- **contenteditable div（却下）**: XSSリスクが増加し、formとの統合も複雑
- **固定高さtextarea（却下）**: 1行入力時のスペース効率が悪い

**トレードオフ**:
- 利点: 複数行の質問やコードスニペットの貼り付けが可能
- 妥協: 自動拡張の高さ計算ロジックが追加される

### 決定8: tmuxポーリング中のスクロール位置保持

**What**: tmuxペイン出力のポーリング更新時に、マークダウンプレビュー領域のスクロール位置が変化しないようにする

**How**:
- ファイル: `public/styles.css`
- 実装方針: `.tmux-output` に固定の `height`（`min-height` と `max-height` を同じ値に設定、または `height` を固定値に）を適用し、内容量の変化がflex計算に影響しないようにする

**Why（Core）**:

なぜCSSで解決？
→ 根本原因は `.tmux-output` の内容量が変わるたびにフレックスアイテムの高さが再計算され、`.markdown-body` の高さが変動すること。出力エリアの高さを固定すれば、ポーリング更新時にレイアウト再計算が発生しない

なぜJSでのスクロール位置保存/復元ではないか？
→ JSでの保存/復元は、レイアウト変動→スクロールリセット→復元という一瞬のちらつきが発生しうる。CSSでレイアウト変動自体を防ぐ方が確実

**検討した選択肢**:
- **`.tmux-output` の高さ固定（採用）**: レイアウト変動の根本原因を排除
- **JS での scrollTop 保存/復元（却下）**: ちらつきのリスク、タイミング依存
- **`overflow-anchor: auto` CSS プロパティ（却下）**: ブラウザサポートが不完全で、スクロールアンカリングの意図と異なる

**トレードオフ**:
- 利点: ポーリング更新によるスクロール位置の意図しない変化を完全に防止
- 妥協: 出力エリアの高さが固定されるため、内容が少ない場合にも同じ高さを占有する

### 決定9: ttydによるWebターミナルエミュレーション（PoC）

**What**: 現在のプレーンテキスト表示+HTTPポーリング方式を、ttyd（外部ツール）によるWebターミナルエミュレーションに置き換える。キャッチアップパネル内にttydのWebUIをiframeで埋め込み、tmuxペインの完全なターミナル表示（ANSIカラー、カーソル移動、スクロール等）をブラウザ上で実現する。

**How**:
- ファイル: `src/index.ts`, `src/server.ts`, `public/app.js`, `public/index.html`, `public/styles.css`
- 外部ツール: ttyd（`brew install ttyd`等で事前インストールが必要）
- 実装方針:
  1. md-open-browser起動時に`ttyd`を子プロセスとして起動し、`tmux attach-session -t <session>`を実行
  2. ttydは専用ポート（md-open-browserのポート+1）でWebサーバーを起動
  3. フロントエンドのキャッチアップパネル内にiframeでttydのURLを埋め込み表示
  4. 既存のHTTPポーリング方式の`/api/tmux/pane`、`/api/tmux/send`は不要になる（ttydが直接双方向通信を提供）
  5. `/api/tmux/status`はttydのURL情報を返すように拡張

**Why（Core）**:

なぜttyd？
→ ttydはtmux/ptyの出力をWebSocket+xterm.jsで配信する成熟したツール。自前でxterm.js統合やWebSocket実装を行うよりも、信頼性・機能性ともに優れている。ANSIカラー、カーソル移動、マウス操作、リサイズ等の全ターミナル機能に対応

なぜiframe埋め込み？
→ ttydは独立したWebサーバーとして動作するため、同一ページ内に表示するにはiframeが最もシンプル。CORSやAPI統合の複雑さを回避できる

なぜ子プロセスとして起動？
→ md-open-browserのライフサイクルに合わせてttydを管理でき、md-open-browser終了時にttydも自動停止する。ユーザーが手動でttydを起動・管理する手間を省く

なぜ`tmux attach-session`？
→ `tmux attach-session`はtmuxペインに「直接アタッチ」するアプローチ。capture-pane経由のポーリングと違い、リアルタイムの双方向通信、完全なターミナルエミュレーションが実現される

**検討した選択肢**:
- **ttyd子プロセス + iframe（採用）**: 実装コスト最小、完全なターミナル体験、成熟したツールの活用
- **xterm.js + HTTPポーリング（却下）**: カラー表示は可能だが2秒遅延が固定的、画面のちらつき発生リスク
- **xterm.js + WebSocket自前実装（却下）**: 実装コスト中~高、wsライブラリの追加依存、pipe-pane等の複雑な連携が必要
- **GoTTY（却下）**: ttydと同様のアプローチだがメンテナンス状況がttydに劣る

**トレードオフ**:
- 利点: 完全なターミナルエミュレーション（カラー、カーソル、リサイズ、マウス）、リアルタイム表示、既存の自前ポーリング+送信コードが不要になり簡素化
- 妥協: ttydの外部バイナリへの依存（ユーザーが事前にインストールする必要がある）、ポート2つ使用
- PoC段階: まず動作検証を行い、本格採用の判断材料とする

### 決定10: ttyd起動後の固定待機によるポート競合の防止

**What**: `startTtyd` でttydをspawnした後、固定の待機時間（1秒）を挿入してからHTTPサーバーのポート探索を開始する

**How**:
- ファイル: `src/server.ts`
- 実装方針: `startTtyd` 内で `spawn` 後に `await new Promise(resolve => setTimeout(resolve, 1000))` を挿入。また、ttydのstderrをコンソールに出力するようにする

**Why（Core）**:

なぜこのアプローチ？
→ ttydの `spawn` は即座にreturnし、ttydが実際にポートをバインドするまでに時間がかかる。その間にHTTPサーバーが同じポートを「空き」と判定して先にバインドすると、ttydがexit code 1で異常終了する。固定待機を入れることで、ttydがポートをバインドする時間を確保する

なぜ固定wait方式？
→ stdoutパース方式やポート接続確認方式と比較して最もシンプル。ttydの起動は通常数百ミリ秒で完了するため、1秒の待機で十分に安全

なぜstderrの出力を追加？
→ 現在ttydのstdio設定が `["ignore", "pipe", "pipe"]` だが、stderrの内容を読んでいないため、ttyd起動失敗時の原因特定が困難。stderrをコンソールに転送することでデバッグを容易にする

**検討した選択肢**:
- **固定wait方式（採用）**: 最もシンプルで実装コストが低い。1秒の待機はユーザー体験に影響しない
- **stdoutパース方式（却下）**: ttydの出力フォーマットに依存するため、ttydのバージョンアップで壊れるリスクがある
- **ポート接続確認方式（却下）**: TCPポーリングのオーバーヘッドと実装の複雑さが不釣り合い

**トレードオフ**:
- 利点: 実装がシンプルで確実にレースコンディションを防止
- 妥協: 環境によってはttydの起動が1秒以上かかる可能性がゼロではないが、実用上は十分

---

## 追加設計決定（v3）

### 決定11: グループセッション + ズームによるペイン表示分離

**What**: ttyd接続時にtmuxグループセッションを作成し、対象ペインをズーム最大化することで、ブラウザ上に対象ペインのみを表示する

**How**:
- ファイル: `src/server.ts`
- 実装方針:
  1. `tmux new-session -d -t <original_session> -s md-open-ttyd-<pid>` でグループセッション作成
  2. `tmux select-window -t md-open-ttyd-<pid>:<window_index>` で対象ウィンドウを選択
  3. ズーム前に `tmux display-message -p -t <pane_id> "#{window_zoomed_flag}"` でズーム状態を記録
  4. 未ズーム時のみ `tmux resize-pane -Z -t <pane_id>` で対象ペインをズーム
  5. ttydはグループセッションにアタッチ: `ttyd --writable tmux attach-session -t md-open-ttyd-<pid>`
  6. md-open-browser終了時: ズーム解除（自分がズームした場合のみ）+ グループセッション破棄

**Why（Core）**:

なぜグループセッション？
→ `tmux new-session -t <session>` で元セッションとウィンドウを共有する新セッションを作成できる。各セッションは独立した「現在のウィンドウ」を持つため、ttyd側で特定ウィンドウに切り替えても元セッションのウィンドウ選択には影響しない

なぜズーム？
→ tmuxのattach-sessionはセッション→ウィンドウ→ペイン全体を表示するため、特定ペインのみを表示する直接的な方法がない。ズーム（`resize-pane -Z`）で対象ペインを最大化することで、他のペインを隠す

なぜプロセスIDをセッション名に含める？
→ 同じペインに対して複数のmd-open-browserインスタンスが起動された場合の名前衝突を防止

なぜズーム状態を記録する？
→ `resize-pane -Z` はトグル動作。ユーザーが既にズーム済みの場合、クリーンアップ時のunzoom呼び出しが逆にズーム解除してしまう。初期状態を記録し、md-open側でズームした場合のみ復元する

**検討した選択肢**:
- **グループセッション + ズーム（採用）**: 元セッションと独立したウィンドウ選択が可能。ズームによりペイン分離を実現
- **直接ズームのみ（却下）**: グループセッションなしでズームすると、セッション管理（現在のウィンドウ選択等）が元のターミナルに影響する
- **capture-pane -e + ポーリング（却下）**: ANSIカラー対応は可能だがリアルタイム性が低く、インタラクティブ操作不可
- **pipe-pane + WebSocket（却下）**: 実装が複雑で、ttydが提供する機能を再実装することになる

**トレードオフ**:
- 利点: ブラウザ上に対象ペインのみが表示される。元セッションのウィンドウ選択に影響しない
- 妥協: ズーム状態はウィンドウ単位で共有されるため、元のターミナルでも対象ペインがズーム表示になる。md-open-browser終了時に元に戻す

### 決定12: ドラッグハンドルによるパネルリサイズ

**What**: マークダウンプレビュー領域とキャッチアップパネルの間にドラッグハンドルを配置し、マウスドラッグでパネル高さを自由に変更できるようにする

**How**:
- ファイル: `public/index.html`, `public/styles.css`, `public/app.js`
- 実装方針:
  1. `.markdown-body`（`<article>`）と`.tmux-panel`の間に`.resize-handle`要素を追加
  2. mousedown/mousemove/mouseupイベントでドラッグ操作を実装
  3. ドラッグ中はiframeの`pointer-events: none`を設定（マウスイベントの横取り防止）
  4. パネル高さの最小値（150px）と最大値（80vh）を制限

**Why（Core）**:

なぜドラッグハンドル？
→ DevTools、IDE等のプロフェッショナルツールで標準的なUIパターン。CSS `resize`プロパティと比べて、ハンドルの位置が明確でiframe内のコンテンツとの干渉がない

なぜiframeのpointer-events制御？
→ ドラッグ中にマウスがiframe上に移動すると、mousemoveイベントがiframeに奪われてリサイズが中断される。ドラッグ中のみ`pointer-events: none`を適用することで確実なドラッグ操作を実現

**検討した選択肢**:
- **ドラッグハンドル（採用）**: 直感的、iframe対応、DevTools同等のUX
- **CSS resize: vertical（却下）**: ハンドルが右下の小さなアイコンのみで目立たない。iframeとの相互作用で機能しない場合がある
- **ダブルクリックでプリセットサイズ切替（却下）**: 自由なサイズ指定ができない

**トレードオフ**:
- 利点: ユーザーが自由にパネルサイズを調整可能
- 妥協: JS実装が必要（20-30行程度）

### 決定13: グループセッションによる表示崩れの根本解決

**What**: 決定11で採用するグループセッション方式により、ttydクライアントのターミナルサイズが元セッションの表示に影響する問題を根本的に軽減する。追加として`window-size latest`設定を推奨する

**How**:
- 根本対応: グループセッションにより、ttydが独立した「セッション」として接続される。`window-size latest`設定と組み合わせると、最後に操作したクライアントのサイズに従うため、ターミナルに戻った際に即座にターミナルサイズに復帰する
- ファイル: `src/server.ts`（グループセッション作成時に`window-size latest`をセッションオプションとして設定）

**Why（Core）**:

なぜ`window-size latest`？
→ tmuxのデフォルト`window-size smallest`では、全クライアントの最小サイズにウィンドウが合わされる。ttydクライアントのサイズがターミナルと異なる場合、表示が崩れる。`latest`に設定すると最後に操作したクライアントのサイズに従うため、ターミナル操作時はターミナルサイズに即復帰する

なぜグローバルではなくセッションレベル設定？
→ ユーザーのグローバルtmux設定を変更するのは副作用が大きい。グループセッション作成時にそのセッションのみに`window-size latest`を設定することで影響を限定する

**検討した選択肢**:
- **セッションレベル設定（採用）**: 影響範囲が限定的で安全
- **グローバル設定（却下）**: 他のtmuxセッションに予期しない影響
- **ttydのクライアントオプションで固定サイズ（却下）**: ttyd内蔵のFitAddonが有効なため完全固定は困難

---

## 追加設計決定（v4）

### 決定14: ドラッグリサイズ時のiframe内ターミナルリサイズ追従

**What**: ドラッグハンドルによるパネルリサイズ時に、ttyd iframe内のxterm.js FitAddonが確実にターミナルサイズを再計算するよう、明示的なリサイズトリガーを実装する

**How**:
- ファイル: `public/app.js`, `public/styles.css`
- 実装方針:
  1. `.ttyd-frame`の`min-height: 300px`を`min-height: 0`に変更（flex shrinkを許可）
  2. ttydモード初期化時にパネルの明示的な初期高さ（`40vh`）を設定
  3. ドラッグ完了時（mouseup）に、iframeの幅を1px縮小→1フレーム後に復元する「width toggle」で強制的にviewportリサイズイベントを発火
  4. ドラッグ中（mousemove）も150msデバウンスでリサイズ通知を送信

**Why（Core）**:

なぜiframe内のターミナルがリサイズに追従しないのか？
→ dev-browserによる実機検証で確認済み: ドラッグでパネル339px→539pxに拡大し、iframe 300px→500pxに変化しても、xterm.jsのターミナル表示領域は元のサイズのまま変化しなかった。width toggle適用後に即座にリサイズが反映された。原因は2つ: (1) `.ttyd-frame`の`min-height: 300px`がflex shrinkを阻害し、パネルを小さくしてもiframeのviewportサイズが変化しない。(2) cross-origin iframe（ttydは別ポートで動作）では、ブラウザ（Chromium含む）がCSS flex reflow経由のiframe高さ変更時に`window.resize`イベントを発火しない

なぜwidth toggleアプローチ？
→ cross-origin iframeでは`contentWindow.dispatchEvent()`がセキュリティポリシーで使用不可。iframeのwidthを1px変更→復元することで、ブラウザにviewport変更を明示的に通知し、iframe内のresize eventを確実に発火させる。この方法はorigen policyに抵触しない

なぜmin-height: 0に変更？
→ `min-height: 300px`があると、パネル高さが300px+ヘッダー高さ以下に縮小された場合、iframeのviewportサイズは300pxのまま変化しない（`.tmux-panel-body`の`overflow: hidden`で視覚的にクリップされるのみ）。`min-height: 0`にすることで、iframeはパネルの高さに応じて自由に伸縮し、viewportサイズが実際に変化する

なぜパネルに初期高さ40vhを設定？
→ `min-height`の撤廃により、iframe（flex: 1）は0pxまで縮小可能になる。パネルに明示的な初期高さを設定しないと、flex layoutによりiframeが極端に小さくなる可能性がある。40vhはビューポート高さの40%で、マークダウンプレビューとターミナルのバランスが取れる

**検討した選択肢**:
- **width toggleトリック（採用）**: cross-origin制約に抵触しない。実装がシンプル（5行程度）で確実にviewportリサイズを通知
- **postMessage通信（却下）**: ttydはpostMessageリスナーを実装していないため、受信側の対応が不可能
- **同一originプロキシ（却下）**: server.tsにリバースプロキシを追加する必要があり、WebSocket対応も含め実装コストが高い
- **ResizeObserver単独（却下）**: iframeの外側の要素に対するResizeObserverは発火するが、それだけではiframe内部にリサイズが伝播しない。width toggleとの組み合わせが必要

**トレードオフ**:
- 利点: ドラッグ中もドラッグ後もターミナルがリサイズに追従する。cross-originでも動作する
- 妥協: width toggleによる1px幅変更が1フレーム（約16ms）発生するが、視覚的には知覚不可能

---

## 追加設計決定（v5）

### 決定15: パネルの右側配置

**What**: キャッチアップパネルを下部から右側に移動し、マークダウンプレビューと横並びで表示する

**How**:
- ファイル: `public/styles.css`, `public/app.js`
- 実装方針:
  1. `.content`の`flex-direction`を`column`から`row`に変更
  2. `.resize-handle`を水平バー（`height: 6px`, `cursor: row-resize`）から垂直バー（`width: 6px`, `cursor: col-resize`）に変更
  3. `.tmux-panel`の`border-top`を`border-left`に変更
  4. リサイズロジックをY軸計算からX軸計算に変更
  5. パネルの初期サイズを`40vh`（高さ）から`40vw`（幅）に変更
  6. パネルの最小幅200px、最大幅60vwに制約（dev-browser検証により80vwではプレビュー不可のため60vwに決定）

**Why（Core）**:

なぜ右側配置？
→ 下部配置では画面の縦方向の表示領域が不足する。マークダウンプレビューを読みながらターミナルを確認する際、右側に配置する方が両方の内容を十分な面積で表示できる

なぜ`flex-direction: row`？
→ 既存のflex layoutを活かし、方向を変えるだけで右側配置を実現できる。HTML構造の変更が不要

**検討した選択肢**:
- **flex-direction: row（採用）**: 最小限のCSS変更で右側配置を実現。HTML変更不要
- **position: fixed + right側配置（却下）**: フロートレイアウトはコンテンツ領域との連動が困難
- **CSS Grid（却下）**: flex layoutで十分。追加の複雑性に見合わない

**トレードオフ**:
- 利点: マークダウンプレビューとターミナルを十分な面積で同時表示可能
- 妥協: 画面幅が狭い場合（モバイル等）はレイアウトが窮屈になるが、本ツールはデスクトップ開発環境での使用を前提とする

### 決定16: ttyd遅延初期化

**What**: ttydプロセス・グループセッション・ズームの起動をアプリケーション起動時ではなく、ユーザーがパネルを初めて展開した時に遅延実行する

**How**:
- ファイル: `src/server.ts`, `public/app.js`
- 実装方針:
  1. `startServer`からttyd起動・グループセッション作成・ズームのロジックを削除
  2. 新API `POST /api/tmux/init-ttyd` を追加し、オンデマンドで初期化を実行
  3. `GET /api/tmux/status`に`ttydAvailable`フィールドを追加（ttydコマンドの存在有無）
  4. フロントエンドのキャッチアップパネルはデフォルトで折りたたみ状態
  5. ユーザーが初めてパネルを展開した際に`POST /api/tmux/init-ttyd`を呼び出し
  6. ローディング表示後、ttydUrlを取得してiframeを作成
  7. 2回目以降の展開/折りたたみはUI表示切替のみ（ttydは起動したまま）

**Why（Core）**:

なぜ遅延初期化？
→ `--use-claude-code`オプション使用時、ユーザーがターミナルパネルを必要としない場合でもttyd+グループセッション+ズームが即座に起動される。特にズームは元のターミナル表示に影響を与えるため、不要時に実行すべきではない

なぜ新APIエンドポイント？
→ ttydの起動にはサーバーサイドでの処理（グループセッション作成、ttydプロセス起動、ポート確保）が必要。フロントエンドから明示的にリクエストすることでライフサイクルを制御

なぜ折りたたみ時もttydを維持？
→ ttydの停止・再起動にはグループセッションの破棄・再作成やポート確保が必要で、数秒のオーバーヘッドが発生する。一度起動したttydは維持し、表示の切替のみ行う方がUXが良い

**検討した選択肢**:
- **遅延初期化 + API（採用）**: 未使用時のリソース消費なし、ズームの意図しない発生なし
- **UI非表示のみ（却下）**: ttyd+グループセッション+ズームは即座に起動するため、使わない場合でもターミナル表示への影響が発生
- **遅延 + ズームのみ遅延（却下）**: ttydはグループセッションにアタッチする必要があり、セッション作成とttyd起動は一体的に行う必要がある

**トレードオフ**:
- 利点: 不使用時のリソース消費ゼロ、ターミナルへの副作用なし
- 妥協: 初回展開時に1-2秒の待機が発生（ttyd起動 + グループセッション作成）
