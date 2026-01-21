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

## リリースプロセス

このプロジェクトは[release-please](https://github.com/googleapis/release-please)を使用した自動リリースを採用しています。

### Conventional Commits

以下のコミットプレフィックスを使用してください：

- `feat:` - 新機能（マイナーバージョンアップ）
- `fix:` - バグ修正（パッチバージョンアップ）
- `feat!:` または `fix!:` - 破壊的変更（メジャーバージョンアップ）
- `chore:`, `docs:`, `refactor:` - バージョンアップなし

### リリースフロー

1. `main`ブランチにコミットをpush
2. release-pleaseがリリースPRを作成または更新
3. リリースPRをマージするとnpm publishが自動実行

### 手動パブリッシュ

緊急時は以下の手順で手動パブリッシュできます：

1. Actions > release-pleaseを開く
2. "Run workflow"をクリック
3. mode: "publish"を選択して実行
