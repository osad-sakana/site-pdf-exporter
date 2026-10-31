# site-pdf-exporter

指定したURLを、Playwright(Chromium)のヘッドレスブラウザで実際にレンダリングし、
**PC表示** と **スマホ表示** の2パターンのPDFとして書き出すCLIツールです。

単純なHTML取得ではなく、実ブラウザでJavaScriptの描画・レスポンシブ切り替えを再現した上でPDF化します。
印刷用CSS(`@media print`)ではなく、画面表示(`screen`)のレイアウトをそのまま出力します。
ページ全体の高さを計測し、A4分割などせず1ページの縦長PDFとして出力します。

## セットアップ

### 1. 依存パッケージのインストール

```bash
pnpm install
```

### 2. Playwrightのブラウザ本体(Chromium)のインストール

```bash
pnpm exec playwright install chromium
```

初回のみ必要です。Chromium本体がダウンロードされます。

## 使い方

```bash
node bin/site-pdf-exporter.js <URL> [出力先ディレクトリ] [オプション]
```

URLに `&` や `(` `)` などシェルの特殊文字が含まれる場合は、URLをクォートしてください。

```bash
node bin/site-pdf-exporter.js "https://example.com/path?foo=bar"
```

### 例

```bash
# カレントディレクトリに出力
node bin/site-pdf-exporter.js https://example.com

# 出力先ディレクトリを指定
node bin/site-pdf-exporter.js https://example.com ./output
```

実行すると、出力先ディレクトリに以下の2ファイルが生成されます。

```
example.com_pc.pdf
example.com_mobile.pdf
```

ファイル名は `<ドメイン名>_pc.pdf` / `<ドメイン名>_mobile.pdf` の形式です
(ポート番号を含む場合は `<ドメイン名>_<ポート番号>_pc.pdf` のようになります)。

### オプション

| オプション | 説明 | デフォルト |
|---|---|---|
| `--wait-until <mode>` | ページ読み込み完了の判定条件。`load` / `domcontentloaded` / `networkidle` / `commit` | `networkidle` |
| `--timeout <ms>` | ページ読み込みのタイムアウト(ミリ秒) | `30000` |
| `--extra-wait <ms>` | 読み込み完了判定後に追加で待つ時間(ミリ秒)。非同期描画やアニメーション待ちに使用 | `0` |
| `--skip-scroll` | 遅延読み込み(`loading="lazy"`等)を発火させるための自動スクロールパスを無効化する | 無効(スクロールを実行) |

無限スクロールや常時通信が発生するサイトでは `networkidle` がタイムアウトすることがありますが、
その場合もエラーで停止せず、警告を表示した上でその時点で取得できた内容をPDF化します。

## ビューポート設定

PC/スマホのビューポート条件は [`src/config.js`](./src/config.js) の `VIEWPORT_CONFIGS` に集約されています。
サイズやUser-Agentを変更したい場合はこのファイルのみを編集してください。

| | PC | スマホ |
|---|---|---|
| ビューポート幅 | 1440px | 390px |
| User-Agent | デフォルト(デスクトップ) | iPhone相当 |
| タッチ対応 | なし | あり(`hasTouch: true`) |
| `isMobile` | false | true |

## 制約事項

- **レスポンシブ非対応サイトの崩れ**: 対象サイトがスマホ表示(390px幅)に対応したCSSを持たない場合、
  スマホ版PDFのレイアウトが崩れて見えることがあります。これはツールの不具合ではなく、
  対象サイト側の実装(レスポンシブ対応の有無)に依存する挙動です。
- **無限スクロール・遅延読み込みサイト**: ページ最下部までの自動スクロールパスを実装していますが、
  無限にコンテンツが追加され続けるサイトでは最大30ステップで打ち切ります(`src/config.js` の
  `MAX_SCROLL_STEPS`)。想定通りに全コンテンツが読み込まれない場合は `--extra-wait` や
  `--wait-until` の調整、または `--skip-scroll` の有無を試してください。
- **vh指定の固定**: `100vh` 等(`vh`/`dvh`/`svh`/`lvh`)の縦方向ビューポート単位は、PDF生成前に
  ビューポート高さ基準のpxへ固定し、heroセクション等がページ全体の高さに引き伸ばされないようにしています。
  クロスオリジンのスタイルシート内の指定は読み取れないため固定できず、警告が表示されます。
- **巨大なページ**: ページの高さが非常に大きい場合、PDFファイルサイズが大きくなったり、
  レンダリングに時間がかかることがあります。

## 動作確認

- ローカル環境: Node.js v18以上
- パッケージ管理: pnpm
