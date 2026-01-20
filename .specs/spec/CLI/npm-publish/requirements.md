---
description: npm publish対応の要件定義
---
# npm publish対応

BunランタイムからNode.jsへ移行し、npmパッケージとして公開可能にする。
これにより、一般のWeb開発者がnpxコマンドで即座にmd-openを利用できるようになる。

関連: [design](design.md)

## EARS記法パターン

| パターン | 構文 | 用途 |
|---------|------|------|
| Event-Driven | When [イベント], the [システム] shall [アクション] | イベント発生時の動作 |
| State-Driven | While [状態], the [システム] shall [アクション] | 特定状態中の動作 |
| Unwanted | If [トリガー], the [システム] shall [アクション] | 異常系・エラー処理 |
| Optional | Where [機能], the [システム] shall [アクション] | オプション機能 |
| Ubiquitous | The [システム] shall [アクション] | 常に適用される動作 |

## 1. ランタイム移行

**目的**: 開発者として、Node.jsランタイムでmd-openを実行したい。それにより、Bunのインストールなしで利用できるようになる。

### 受け入れ基準

1.1 The システムはNode.js 20以上のランタイムで動作するものとする

1.2 The エントリーポイント（src/index.ts）はshebang行に`#!/usr/bin/env node`を使用するものとする

1.3 When ユーザーが`npx md-open file.md`を実行した場合, the システムはNode.jsランタイムでCLIを起動するものとする

1.4 The システムはBun固有のAPI（Bun.serve, Bun.file, Bun.argv, import.meta.dir）を使用しないものとする

## 2. HTTPサーバー移行

**目的**: 開発者として、Node.js標準httpモジュールでサーバーを動作させたい。それにより、外部依存を最小化できる。

### 受け入れ基準

2.1 The HTTPサーバーはNode.js標準の`http.createServer`を使用して実装するものとする

2.2 When `GET /api/files`リクエストを受信した場合, the サーバーはファイル情報のJSONを返却するものとする
  - レスポンス形式: `[{ "name": "filename.md", "path": "/path/to/file.md" }]`
  - Content-Type: `application/json; charset=utf-8`
  - ステータスコード: 200

2.3 When `GET /api/files/:filename`リクエストを受信した場合, the サーバーは該当ファイルの内容をプレーンテキストで返却するものとする
  - Content-Type: `text/plain; charset=utf-8`
  - ステータスコード: 200

2.4 When 存在しないファイル名でリクエストを受信した場合, the サーバーは404ステータスを返却するものとする

2.5 When `GET /`または`GET /index.html`リクエストを受信した場合, the サーバーはpublic/index.htmlを返却するものとする

2.6 When 静的ファイルリクエストを受信した場合, the サーバーはpublic/配下の該当ファイルを適切なContent-Typeで返却するものとする
  - .html: `text/html; charset=utf-8`
  - .css: `text/css; charset=utf-8`
  - .js: `application/javascript; charset=utf-8`

2.7 If 指定ポートが使用中の場合, the システムはポート番号を+1してリトライするものとする（最大10回）

2.8 The サーバーはserver.close()メソッドで正常に停止できるものとする

## 3. ファイルI/O移行

**目的**: 開発者として、Node.js標準のfsモジュールでファイル操作を行いたい。それにより、Bun依存を排除できる。

### 受け入れ基準

3.1 The システムはファイル読み取りに`fs.promises.readFile`を使用するものとする

3.2 The システムはファイル存在確認に`fs.promises.stat`またはtry-catchパターンを使用するものとする

3.3 The システムはディレクトリパス取得に`fileURLToPath(import.meta.url)`と`dirname`を使用するものとする

## 4. ビルドとnpx実行

**目的**: 開発者として、TypeScriptを事前にビルドしてnpxで実行可能にしたい。それにより、エンドユーザーはTypeScriptランタイムなしで実行できる。

### 受け入れ基準

4.1 The システムはtscを使用してTypeScriptをJavaScriptにトランスパイルするものとする
  - 出力ディレクトリ: `dist/`
  - ソースディレクトリ: `src/`

4.2 When `npm run build`を実行した場合, the システムは`dist/`ディレクトリにJavaScriptファイルを生成するものとする

4.3 The package.jsonのbinフィールドは`"md-open": "dist/index.js"`を指定するものとする

4.4 When `npm publish`を実行した場合, the システムはprepackフックで自動的にビルドを実行するものとする

4.5 When npxで実行される場合, the システムはビルド済みのJavaScriptファイルを実行するものとする（TypeScriptランタイム不要）

4.6 The dist/index.jsファイルは先頭にshebang行`#!/usr/bin/env node`を含むものとする

## 5. テストフレームワーク移行

**目的**: 開発者として、Node.js標準のテストランナーを使用したい。それにより、bun:test依存を排除できる。

### 受け入れ基準

5.1 The テストはNode.js標準の`node:test`モジュールを使用するものとする

5.2 The アサーションはNode.js標準の`node:assert`モジュールを使用するものとする

5.3 When `npm test`を実行した場合, the システムは全テストファイルを実行するものとする

5.4 The テストファイルは以下のパターンで変換されるものとする:
  - `import { describe, test, expect } from "bun:test"` → `import test from "node:test"; import assert from "node:assert"`
  - `expect(a).toBe(b)` → `assert.strictEqual(a, b)`
  - `expect(a).toEqual(b)` → `assert.deepStrictEqual(a, b)`
  - `beforeAll/afterAll` → `test.before/test.after`

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

## 7. 後方互換性

**目的**: 既存ユーザーとして、移行後も同じCLIインターフェースで使用したい。それにより、学習コストなしで継続利用できる。

### 受け入れ基準

7.1 The CLIオプションは以下を維持するものとする:
  - `-h, --help`: ヘルプ表示
  - `-v, --version`: バージョン表示
  - `-p, --port <number>`: ポート番号指定（デフォルト: 3000）
  - `--no-open`: ブラウザ自動起動の無効化

7.2 The 位置引数はマークダウンファイルパスのリストとして処理されるものとする

7.3 When 存在しないファイルが指定された場合, the システムは警告を表示し、有効なファイルのみを処理するものとする

7.4 When 有効なファイルが0件の場合, the システムはエラーを表示して終了するものとする

## 8. ドキュメント更新

**目的**: ユーザーおよび開発者として、最新の技術スタックと使用方法を把握したい。それにより、正しくツールを利用・開発できる。

### 受け入れ基準

8.1 The CLAUDE.mdは以下の内容に更新するものとする:
  - 技術スタック: Node.js 20+, npm, tsc
  - 開発コマンド: `npm run dev`, `npm test`, `npm run build`
  - テストフレームワーク: node:test

8.2 The README.mdは以下の内容を含むものとする:
  - ビルド手順: `npm run build`
  - npx実行方法: `npx md-open file.md`
  - 開発実行方法: `npm run dev -- file.md`
  - 必要な環境: Node.js 20以上

8.3 The README.mdの「npxで即座に実行」セクションはnpm publish前の注意事項を含むものとする
