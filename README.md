# md-open

マークダウンファイルをブラウザでプレビューするCLIツール。

## 必要な環境

- Node.js 20以上

## インストール

```bash
npm install
```

## 使い方

### npxで即座に実行

**注意**: npm publishを実行してから利用可能になります。

```bash
npx md-open file1.md file2.md
```

### 開発環境での実行

```bash
npm run dev -- file1.md file2.md
```

### オプション

- `--help`, `-h`: ヘルプを表示
- `--version`, `-v`: バージョン情報を表示
- `--port <number>`, `-p <number>`: サーバーのポート番号を指定（デフォルト: 3000）
- `--no-open`: ブラウザを自動で開かない

## 開発

### ビルド

```bash
npm run build
```

### テスト実行

```bash
npm test
```

## 機能

- 複数のマークダウンファイルを指定してプレビュー
- 左側にファイルリスト、右側にプレビュー表示
- mermaidダイアグラム対応
- シンタックスハイライト対応
- ポート競合時の自動解決
