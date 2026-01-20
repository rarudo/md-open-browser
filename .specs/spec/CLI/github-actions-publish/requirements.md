---
description: GitHub Actions npm publish自動化の要件定義
---
# GitHub Actions npm publish自動化

GitHub Actionsを使用してnpmパッケージを自動的にパブリッシュする機能を追加する。
release-pleaseによるバージョン管理、OIDC Trusted Publishingによるセキュアな認証、セキュリティ監査の定期実行を実現する。

関連: [design](design.md) | [npm-publish対応](../npm-publish/requirements.md)

## EARS記法パターン

| パターン | 構文 | 用途 |
|---------|------|------|
| Event-Driven | When [イベント], the [システム] shall [アクション] | イベント発生時の動作 |
| State-Driven | While [状態], the [システム] shall [アクション] | 特定状態中の動作 |
| Unwanted | If [トリガー], the [システム] shall [アクション] | 異常系・エラー処理 |
| Optional | Where [機能], the [システム] shall [アクション] | オプション機能 |
| Ubiquitous | The [システム] shall [アクション] | 常に適用される動作 |

## 1. release-pleaseによるバージョン管理

**目的**: 開発者として、コミットメッセージからリリースPRを自動生成したい。それにより、手動でのバージョン管理作業を削減できる。

### 受け入れ基準

1.1 When mainブランチにpushされた場合, the release-pleaseアクションはコミットメッセージを解析し、リリースPRを作成または更新するものとする
  - Conventional Commits形式のメッセージを解析
  - feat/fix/breaking changeに基づいてバージョンを決定

1.2 When リリースPRがマージされた場合, the release-pleaseアクションはGitHubリリースを作成し、Git tagを付与するものとする
  - タグ形式: `v{major}.{minor}.{patch}`（例: v1.0.0）
  - CHANGELOG.mdを自動更新

1.3 The release-please-config.jsonは以下の設定を含むものとする:
  - `release-type`: "node"
  - `package-name`: "md-open"
  - `changelog-path`: "CHANGELOG.md"

1.4 The .release-please-manifest.jsonは現在のバージョン番号を管理するものとする
  - 初期値: package.jsonの現在のバージョン

## 2. OIDC Trusted Publishingによるnpm認証

**目的**: 開発者として、npmトークンを管理せずにパブリッシュしたい。それにより、トークン漏洩リスクを排除できる。

### 受け入れ基準

2.1 The ワークフローはOIDC認証を使用してnpmにパブリッシュするものとする
  - NPM_TOKENは不要
  - GitHub ActionsのOIDCトークンで認証

2.2 The ワークフローのpermissionsは以下を含むものとする:
  - `contents: write` - リポジトリコンテンツへの書き込み
  - `pull-requests: write` - PRの作成・更新
  - `id-token: write` - OIDCトークンの生成

2.3 When npm publishを実行する場合, the システムは`--provenance --access public`オプションを使用するものとする
  - provenanceはビルド元情報を証明
  - accessはpublicパッケージとして公開

2.4 The npm publishはnpm v11.5.1以上で実行するものとする
  - OIDC Trusted Publishingの要件

2.5 The ワークフローは`actions/setup-node@v4`でregistry-urlを指定するものとする
  - `registry-url: 'https://registry.npmjs.org'`

## 3. リリースワークフローの構成

**目的**: 開発者として、mainブランチへのプッシュで自動リリースフローを開始したい。それにより、リリース作業を自動化できる。

### 受け入れ基準

3.1 The release-please.ymlワークフローは以下のトリガーで実行されるものとする:
  - push: mainブランチへのプッシュ
  - workflow_dispatch: 手動トリガー（mode: "publish" | "release"）

3.2 The releaseジョブは以下の条件で実行されるものとする:
  - `github.event_name != 'workflow_dispatch' || inputs.mode == 'release'`
  - release-pleaseによる通常のリリースフロー

3.3 When `steps.release.outputs.release_created`がtrueの場合, the ワークフローは以下を順番に実行するものとする:
  1. リポジトリのチェックアウト
  2. Node.js 22のセットアップ（registry-url指定）
  3. 依存関係のインストール（`npm ci`）
  4. ビルドの実行（`npm run build`）
  5. npmの更新（v11.5.1以上）
  6. npm publish（--provenance --access public）

3.4 The publishジョブは手動トリガー時のみ実行されるものとする:
  - `github.event_name == 'workflow_dispatch' && inputs.mode != 'release'`
  - 緊急時の任意ブランチからのパブリッシュに対応

3.5 The concurrency設定は以下を含むものとする:
  - `group: release-please-${{ github.ref }}`
  - `cancel-in-progress: false`

## 4. セキュリティ監査

**目的**: 開発者として、依存関係の脆弱性を自動的に検出したい。それにより、セキュリティリスクを早期に発見できる。

### 受け入れ基準

4.1 The security-audit.ymlワークフローは以下のトリガーで実行されるものとする:
  - push: mainブランチへのプッシュ
  - pull_request: mainブランチへのPR
  - schedule: 毎週月曜日9:00 JST（cron: "0 0 * * 1"）

4.2 When セキュリティ監査を実行する場合, the ワークフローは以下を実行するものとする:
  - `npm audit --audit-level=high` - 高レベル以上の脆弱性を検出
  - `npx lockfile-lint` - lockfileのセキュリティ検証

4.3 The lockfile-lint設定は以下を含むものとする:
  - `--path package-lock.json` - npm lockfileを検証
  - `--type npm` - npm形式
  - `--validate-https` - HTTPS通信を強制
  - `--allowed-hosts npm` - npmレジストリのみ許可

4.4 If セキュリティ監査でhigh以上の脆弱性が検出された場合, the ワークフローは失敗ステータスを返すものとする

## 5. 設定ファイル構成

**目的**: 開発者として、必要な設定ファイルを適切に配置したい。それにより、ワークフローが正しく動作できる。

### 受け入れ基準

5.1 The プロジェクトは以下のファイル構成を持つものとする:
  ```
  .github/
  └── workflows/
      ├── release-please.yml    # リリースワークフロー
      └── security-audit.yml    # セキュリティ監査
  release-please-config.json    # release-please設定
  .release-please-manifest.json # バージョンマニフェスト
  ```

5.2 The .gitignoreは既存設定を維持するものとする（新規追加なし）

5.3 The package.jsonは変更不要とする（既にnpm publish対応済み）

## 6. npm Trusted Publisher設定（手動）

**目的**: 開発者として、npmjs.comでTrusted Publisherを設定したい。それにより、GitHub ActionsからOIDC認証でパブリッシュできる。

### 受け入れ基準

6.1 The npmjs.comのパッケージ設定でTrusted Publisherを設定するものとする（手動作業）:
  - Provider: GitHub Actions
  - Owner: rarudo
  - Repository: md-open
  - Workflow: release-please.yml

6.2 The 設定は初回のみ手動で実施し、以降は自動認証されるものとする

## 7. ドキュメント更新

**目的**: 開発者として、リリースプロセスを理解したい。それにより、正しくリリースを実行できる。

### 受け入れ基準

7.1 The README.mdにリリースプロセスのセクションを追加するものとする:
  - Conventional Commits形式の説明
  - リリースPRの確認方法
  - 緊急パブリッシュの手順

7.2 The CLAUDE.mdは開発コマンドセクションを更新するものとする:
  - GitHub Actionsワークフローの説明
  - リリースプロセスの概要
