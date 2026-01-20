# md-open - Markdown Preview CLI

## プロジェクト概要

マークダウンファイルをブラウザでプレビューするCLIツール。

### 主な機能
- 複数のマークダウンファイルを指定してプレビュー
- 左側にファイルリスト、右側にプレビュー表示
- mermaidダイアグラム対応
- シンタックスハイライト対応
- ポート競合時の自動解決

### 技術スタック
- Runtime: Node.js 20+
- Build: TypeScript (tsc)
- Server: http標準モジュール
- Markdown: marked
- Diagram: mermaid (CDN)
- Syntax Highlight: highlight.js (CDN)
- Style: github-markdown-css (CDN)
- Test: node:test

## 仕様書

**重要**: 実装時および仕様の更新時は、必ず `.specs/spec/` 配下の仕様書を確認してください。

### 仕様書の場所
- 要件定義: `.specs/spec/CLI/md-open/requirements.md`
- 技術設計: `.specs/spec/CLI/md-open/design.md`

### 作業用ファイル
- 実装タスク: `.specs/tasks/YYYYMMDD_md-open/tasks.md`
- 調査結果: `.specs/tasks/YYYYMMDD_md-open/research.md`
- コード変更詳細: `.specs/tasks/YYYYMMDD_md-open/review.md`

## 開発コマンド

```bash
# ビルド
npm run build

# 開発実行
npm run dev -- tests/fixtures/test1.md tests/fixtures/test2.md

# テスト実行
npm test
```

## プロジェクト構造

```
markdown-render-cli/
├── src/
│   ├── index.ts          # CLIエントリーポイント
│   ├── server.ts         # HTTPサーバー
│   └── *.test.ts         # テストファイル
├── tests/
│   └── fixtures/         # テスト用のサンプルファイル
│       ├── test1.md
│       └── test2.md
├── public/
│   ├── index.html        # HTMLテンプレート
│   ├── styles.css        # スタイル
│   └── app.js            # フロントエンドJS
└── .specs/
    ├── spec/             # 仕様書（Git管理）
    └── tasks/            # 作業用ファイル（Git対象外）
```
