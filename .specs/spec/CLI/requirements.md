---
description: md-open CLIツールの要件定義
---
# md-open CLI

マークダウンファイルをブラウザでプレビューするCLIツール。複数ファイルを指定し、左側のファイルリストから選択して表示を切り替えられる。

関連: [design](design.md)

## EARS記法パターン

| パターン | 構文 | 用途 |
|---------|------|------|
| Event-Driven | When [イベント], the [システム] shall [アクション] | イベント発生時の動作 |
| State-Driven | While [状態], the [システム] shall [アクション] | 特定状態中の動作 |
| Unwanted | If [トリガー], the [システム] shall [アクション] | 異常系・エラー処理 |
| Optional | Where [機能], the [システム] shall [アクション] | オプション機能 |
| Ubiquitous | The [システム] shall [アクション] | 常に適用される動作 |

## 1. CLIコマンド実行

**目的**: ユーザーとして、コマンドラインからマークダウンファイルを指定してプレビューしたい。それにより、ターミナルから素早くドキュメントを確認できる。

### 受け入れ基準

1.1 When `md-open file1.md file2.md ...` コマンドが実行された場合, the システムは指定された全てのマークダウンファイルをプレビュー対象として登録するものとする

1.2 When コマンドがファイル引数なしで実行された場合, the システムはヘルプメッセージを表示して終了するものとする

1.3 When `--help` または `-h` オプションが指定された場合, the システムは使用方法とオプション一覧を表示して終了するものとする

1.4 When `--version` または `-v` オプションが指定された場合, the システムはバージョン情報を表示して終了するものとする

1.5 When `--port <number>` オプションが指定された場合, the システムは指定されたポート番号でサーバーを起動するものとする

1.6 When `--no-open` オプションが指定された場合, the システムはブラウザを自動で開かないものとする

1.7 If 指定されたファイルが存在しない場合, the システムはエラーメッセージを表示し、存在しないファイルをスキップして処理を継続するものとする

1.8 If 全ての指定ファイルが存在しない場合, the システムはエラーメッセージを表示して終了するものとする

## 2. HTTPサーバー

**目的**: ユーザーとして、ローカルサーバー経由でマークダウンをブラウザで閲覧したい。それにより、リッチなレンダリング結果を確認できる。

### 受け入れ基準

2.1 When サーバーが起動された場合, the システムはデフォルトポート3000でHTTPサーバーを開始するものとする

2.2 If デフォルトポート3000が使用中の場合, the システムはポート番号を+1してリトライし、利用可能なポートでサーバーを起動するものとする

2.3 When サーバーが正常に起動した場合, the システムはサーバーURLをコンソールに表示するものとする

2.4 When サーバーが正常に起動した場合, the システムはデフォルトブラウザでプレビューページを開くものとする（`--no-open`指定時を除く）

2.5 When `Ctrl+C` が押された場合, the システムはサーバーを停止してプロセスを終了するものとする

2.6 The システムは静的ファイル（HTML、CSS、JavaScript）を配信するものとする

2.7 The HTTPサーバーはNode.js標準の`http.createServer`を使用して実装するものとする

2.8 When `GET /api/files`リクエストを受信した場合, the サーバーはファイル情報のJSONを返却するものとする
  - レスポンス形式: `[{ "name": "filename.md", "path": "/path/to/file.md" }]`
  - Content-Type: `application/json; charset=utf-8`
  - ステータスコード: 200

2.9 When `GET /api/files/:filename`リクエストを受信した場合, the サーバーは該当ファイルの内容をプレーンテキストで返却するものとする
  - Content-Type: `text/plain; charset=utf-8`
  - ステータスコード: 200

2.10 When 存在しないファイル名でリクエストを受信した場合, the サーバーは404ステータスを返却するものとする

2.11 When `GET /`または`GET /index.html`リクエストを受信した場合, the サーバーはpublic/index.htmlを返却するものとする

2.12 When 静的ファイルリクエストを受信した場合, the サーバーはpublic/配下の該当ファイルを適切なContent-Typeで返却するものとする
  - .html: `text/html; charset=utf-8`
  - .css: `text/css; charset=utf-8`
  - .js: `application/javascript; charset=utf-8`

2.13 The サーバーはserver.close()メソッドで正常に停止できるものとする

## 3. ファイルリスト表示

**目的**: ユーザーとして、複数のマークダウンファイルを切り替えて閲覧したい。それにより、関連するドキュメントを効率的に確認できる。

### 受け入れ基準

3.1 The システムは画面左側に指定されたマークダウンファイルのリストを表示するものとする

3.2 When ファイルリストの項目がクリックされた場合, the システムは選択されたファイルの内容を右側のプレビュー領域に表示するものとする

3.3 The システムは現在表示中のファイルをハイライト表示するものとする

3.4 When サーバーが起動された場合, the システムはリストの最初のファイルを初期表示するものとする

3.5 The システムはファイル名のみをリストに表示するものとする（フルパスではなく）

## 4. ランタイムとビルド

**目的**: 開発者として、Node.jsランタイムでmd-openを実行したい。それにより、npxで即座に利用できる。

### 受け入れ基準

4.1 The システムはNode.js 20以上のランタイムで動作するものとする

4.2 The エントリーポイント（src/index.ts）はshebang行に`#!/usr/bin/env node`を使用するものとする

4.3 When ユーザーが`npx md-open file.md`を実行した場合, the システムはNode.jsランタイムでCLIを起動するものとする

4.4 The システムはtscを使用してTypeScriptをJavaScriptにトランスパイルするものとする
  - 出力ディレクトリ: `dist/`
  - ソースディレクトリ: `src/`

4.5 When `npm run build`を実行した場合, the システムは`dist/`ディレクトリにJavaScriptファイルを生成するものとする

4.6 The package.jsonのbinフィールドは`"md-open": "dist/index.js"`を指定するものとする

4.7 When npxで実行される場合, the システムはビルド済みのJavaScriptファイルを実行するものとする（TypeScriptランタイム不要）

4.8 The dist/index.jsファイルは先頭にshebang行`#!/usr/bin/env node`を含むものとする

## 5. ファイルI/O

**目的**: 開発者として、Node.js標準のfsモジュールでファイル操作を行いたい。それにより、外部依存を最小化できる。

### 受け入れ基準

5.1 The システムはファイル読み取りに`fs.promises.readFile`を使用するものとする

5.2 The システムはファイル存在確認に`fs.promises.stat`またはtry-catchパターンを使用するものとする

5.3 The システムはディレクトリパス取得に`fileURLToPath(import.meta.url)`と`dirname`を使用するものとする

## 6. package.json設定

**目的**: npm管理者として、適切なパッケージ設定でnpm publishしたい。それにより、npxで正しく実行できるようになる。

### 受け入れ基準

6.1 The package.jsonは以下の設定を含むものとする:
  - `"name": "md-open"`
  - `"type": "module"`
  - `"engines": { "node": ">=20.0.0" }`
  - `"main": "dist/index.js"`
  - `"bin": { "md-open": "dist/index.js" }`

6.2 The filesフィールドは公開に必要なファイルのみを含むものとする:
  - `dist/`
  - `public/`

6.3 The dependenciesは実行時に必要なパッケージのみを含むものとする:
  - `marked`
  - `open`

6.4 The devDependenciesは開発時のみ必要なパッケージを含むものとする:
  - `@types/node`
  - `tsx`
  - `typescript`

6.5 The scriptsは以下を含むものとする:
  - `"build": "tsc"`
  - `"prepack": "npm run build"`
  - `"dev": "npx tsx src/index.ts"`
  - `"test": "node --import tsx --test 'src/**/*.test.ts' 'tests/**/*.test.js'"`

## 7. テスト

**目的**: 開発者として、Node.js標準のテストランナーを使用したい。それにより、外部依存を排除できる。

### 受け入れ基準

7.1 The テストはNode.js標準の`node:test`モジュールを使用するものとする

7.2 The アサーションはNode.js標準の`node:assert`モジュールを使用するものとする

7.3 When `npm test`を実行した場合, the システムは全テストファイルを実行するものとする
