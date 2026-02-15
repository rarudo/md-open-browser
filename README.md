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

### tmuxキャッチアップ（Claude Code連携）

tmux環境でClaude Codeと併用する場合、ブラウザ上にターミナルを表示できます。

```bash
# 環境変数TMUX_PANEから自動検出
npx md-open --use-claude-code file1.md

# ペインIDを明示的に指定
npx md-open --tmux-pane %0 file1.md
```

ttydがインストールされている場合、完全なWebターミナルエミュレーション（ANSIカラー、カーソル、リアルタイム入出力）が利用できます。未インストールの場合はプレーンテキスト表示にフォールバックします。

```bash
brew install ttyd
```

### オプション

- `--help`, `-h`: ヘルプを表示
- `--version`, `-v`: バージョン情報を表示
- `--port <number>`, `-p <number>`: サーバーのポート番号を指定（デフォルト: 3000）
- `--no-open`: ブラウザを自動で開かない
- `--use-claude-code`: 環境変数`TMUX_PANE`からペインIDを自動取得してキャッチアップ機能を有効化
- `--tmux-pane <pane_id>`: tmuxペインIDを指定してキャッチアップ機能を有効化

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
- Markdownから参照されるローカル画像のプレビュー表示
- ポート競合時の自動解決
- tmuxキャッチアップUI（Claude Code連携）
  - ttydによるWebターミナルエミュレーション
  - プレーンテキストフォールバック
  - ドラッグリサイズ対応

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
