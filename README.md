# launchdCenter

macOS の launchd ジョブ（バックグラウンドサービス/デーモン）を管理するGUIアプリケーション。

<img src="https://img.shields.io/badge/platform-macOS-blue" alt="macOS"> <img src="https://img.shields.io/badge/arch-Apple%20Silicon-green" alt="Apple Silicon">

## 機能

### ジョブ管理
- 全ドメイン（User Agents, Global Agents/Daemons, System Agents/Daemons）のジョブ一覧表示
- ジョブの読み込み/取り外し、起動/停止、有効化/無効化
- テンプレートからのカスタムジョブ作成・削除
- ジョブの発行元分類（Custom / App / System）

### 状態モニタリング
- リアルタイムのステータス表示（Running, Loaded, Disabled, Error）
- PIDおよび終了ステータスの確認
- 設定の分析・バリデーション

### 設定編集
- フォームUIによるジョブプロパティ編集（Program, Arguments, WorkingDirectory 等）
- KeepAlive, StartInterval, StartCalendarInterval, WatchPaths 等の高度な設定
- XML plistの直接編集（plutil によるバリデーション付き）

### ログ閲覧
- stdout/stderr ログファイルの表示
- macOS 統合ログ（`log show`）のクエリ

### UI
- タブインターフェース（Details, Editor, XML, Analysis, Logs）
- ドメイン・発行元によるフィルタリング
- リアルタイム検索
- ダークモードテーマ

## インストール

[Releases](https://github.com/qalainau/launchdCenter/releases) から DMG をダウンロードしてください。

1. DMG を開く
2. launchdCenter.app をアプリケーションフォルダにドラッグ
3. 起動

> Apple Silicon（M1/M2/M3/M4）Mac 対応

## 開発

```bash
# 依存関係のインストール
npm install

# 開発モードで起動
npm run dev

# DMG ビルド
npm run build:dmg
```

## 技術スタック

- Electron
- Vanilla JavaScript
- plist (npm)

## ライセンス

ISC
