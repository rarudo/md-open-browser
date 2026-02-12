---
description: ローカルアセット配信機能の要件定義
---
# ローカルアセット配信

Markdownファイルから参照される画像やその他のローカルファイルを、ブラウザプレビュー上で表示する機能。Markdownファイルの親ディレクトリを基準にアセットを配信する。

関連: [design](design.md) | [CLI requirements](../requirements.md)

## EARS記法パターン

| パターン | 構文 | 用途 |
|---------|------|------|
| Event-Driven | When [イベント], the [システム] shall [アクション] | イベント発生時の動作 |
| State-Driven | While [状態], the [システム] shall [アクション] | 特定状態中の動作 |
| Unwanted | If [トリガー], the [システム] shall [アクション] | 異常系・エラー処理 |
| Optional | Where [機能], the [システム] shall [アクション] | オプション機能 |
| Ubiquitous | The [システム] shall [アクション] | 常に適用される動作 |

## 1. アセット配信サーバー

**目的**: ユーザーとして、Markdownに含まれるローカル画像をプレビューで確認したい。それにより、ドキュメントの最終的な見た目を正確に把握できる。

### 受け入れ基準

1.1 The サーバーはMarkdownファイルリストからファイル名と親ディレクトリの対応関係を保持するものとする
  - 各ファイルパスは`path.resolve()`で絶対パスに変換してからディレクトリを取得する

1.2 When `GET /assets/{filename}/{filepath}` リクエストを受信した場合, the サーバーは{filename}に対応するMarkdownファイルの親ディレクトリから{filepath}で指定されたファイルを配信するものとする
  - {filename}はMarkdownファイルのbasename（例: `test1.md`）
  - {filepath}は親ディレクトリからの相対パス（例: `images/photo.jpg`）

1.3 If {filename}がファイルマッピングに存在しない場合, the サーバーは404ステータスを返却するものとする

1.4 If リクエストされたファイルがファイルシステム上に存在しない場合, the サーバーは404ステータスを返却するものとする

1.5 If 解決されたファイルパスがMarkdownファイルの親ディレクトリの外部を参照している場合, the サーバーは403ステータスを返却するものとする
  - パストラバーサル攻撃（例: `../../etc/passwd`）を防止する
  - `path.resolve()`後のパスが許可されたベースディレクトリ配下であることを検証する
  - 検証時はディレクトリパスの末尾に`path.sep`を付与して前方一致チェックを行う（`/home/user/docs-evil/`が`/home/user/docs`にマッチする問題を防止）

1.6 The `getContentType()`関数は以下の画像MIMEタイプを追加でサポートするものとする:
  - `.png`: `image/png`
  - `.jpg`, `.jpeg`: `image/jpeg`
  - `.gif`: `image/gif`
  - `.svg`: `image/svg+xml`
  - `.webp`: `image/webp`
  - `.ico`: `image/x-icon`

1.7 When 未知の拡張子のファイルがリクエストされた場合, the サーバーは既存の動作通り`application/octet-stream`をContent-Typeとして返却するものとする

1.8 The アセット配信はファイルをバイナリ（Buffer）として読み込むものとする（エンコーディング指定なし）
  - 画像ファイルをUTF-8として読み込むとデータが破損するため

## 2. アセットURL書き換え（クライアント）

**目的**: ユーザーとして、Markdown内の相対パスで参照された画像が自動的にプレビューに表示されてほしい。それにより、手動でパスを調整する必要がない。

### 受け入れ基準

2.1 When Markdownがレンダリングされた後, the クライアントはプレビュー内の`<img>`要素の相対パスsrc属性を`/assets/{filename}/{path}`形式に書き換えるものとする

2.2 The クライアントは以下のsrc属性を書き換え対象外とするものとする:
  - `http://`または`https://`で始まるURL
  - `//`で始まるプロトコル相対URL
  - `/`で始まる絶対パス
  - `data:`で始まるデータURI

2.3 When src属性が`./`で始まる場合, the クライアントは`./`プレフィックスを除去してから書き換えるものとする

2.4 The `renderMarkdown()`関数は現在表示中のファイル名をパラメータとして受け取り、アセットURL書き換えに使用するものとする

2.5 The クライアントはDOM操作（`querySelectorAll('img')`）によりURL書き換えを行うものとする
  - `preview.innerHTML`設定後、`mermaid.run()`実行前に処理する
