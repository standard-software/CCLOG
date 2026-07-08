# cclog

**Language:** [English](README.md)

Claude Code のセッションログ (JSONL) を、読みやすい 1 つの Markdown ファイルに書き出すツールです。

`cclog` は Claude Code が `~/.claude/projects/<プロジェクトパスをエンコードしたフォルダ名>/`
配下に書き出している JSONL を読み込み、プロジェクト配下に `CCLOG_ALL.md`
(またはセッションごとのファイル) を生成します。出力は実行のたびに再生成
されますが、内容が変わらないときはファイルを触りません。追記だけで済む
場合は末尾だけを追記するので、エディタが先頭から再読込することもありません。

## インストール

```bash
npm install -g @standard-software/cclog
```

npm 上のパッケージ名は
[`@standard-software/cclog`](https://www.npmjs.com/package/@standard-software/cclog)
です。インストール後の CLI コマンド名は `cclog` です。

## 使い方

Claude Code を使っているプロジェクトディレクトリで実行するだけです。

```bash
cd /path/to/your/project
cclog
```

そのプロジェクトの全セッション、全 Q&A ペアを時系列に並べた
`CCLOG/CCLOG_ALL.md` が生成されます。

### オプション

```
cclog [project-path] [options]

引数:
  project-path           対象のプロジェクトディレクトリ (省略時はカレントディレクトリ)。

オプション:
  --out <dir>            出力先ディレクトリ (デフォルト: <project-path>/CCLOG)。
  --per-session          1 セッション 1 ファイル (CCLOG_<sessionId>.md) で
                         出力します (デフォルトは集約版 CCLOG_ALL.md)。
  --init-template        同梱テンプレートを <out>/templates/ にコピーし、
                         cclog.config.json をローカルコピーを指すように
                         書き換えます (グローバルインストールを触らずに
                         テンプレートを編集したいとき用)。
  --backup-jsonl         バックアップ専用: 検出した元の .jsonl ログを
                         <out>/backup_jsonl/<yyyy-mm-dd_hh-mm-ss>_<hostname>/
                         へコピーし、CCLOG_ALL.md やセッション別ファイルは
                         生成せずに終了します (生のログを手元に退避。PC
                         入れ替え前などに有効。元ログの保存場所はマシン依存
                         のプロジェクトパスから決まるため)。フォルダ名に
                         マシン名 (os.hostname()) を含めるので、どの PC の
                         バックアップか判別できます。
  --backup-md            バックアップ専用: 既に出力済みの Markdown (集約ファイルと
                         <out> 内のセッション別ファイル) を
                         <out>/backup_CCLOG_md/<yyyy-mm-dd_hh-mm-ss>_<hostname>/
                         へコピーし、何も再生成せずに終了します。cclog が破壊的な
                         書き換えの前に自動で作るバックアップを、任意のタイミングで
                         手動実行するもの (config やテンプレートを編集する前に現在の
                         出力を退避したいとき等)。
  --dry-run              書き込みを行わず、何を書く予定かだけ表示します。
  --verbose              詳細ログを出力します。
  -v, -V, --version      バージョンを表示して終了します。
  -h, --help             ヘルプを表示します。
```

### 元の JSONL ログをバックアップする

Claude Code が `~/.claude/projects/` 配下に書き出す元ログは、プロジェクト
の絶対パスから決まる名前のフォルダに置かれます。別の PC (または別のパス)
へ移ると、そのフォルダ名が変わるため、`cclog` から旧セッションが見えなく
なります。そうなる前に、生のログを手元に残しておくには:

```bash
cclog --backup-jsonl
```

検出したすべての `.jsonl` を
`CCLOG/backup_jsonl/<yyyy-mm-dd_hh-mm-ss>_<hostname>/` (実行ごとに新しい
タイムスタンプフォルダ。末尾に `os.hostname()` のマシン名が付くので、
どの PC のバックアップか判別できます) にコピーします。`--backup-jsonl` は
**バックアップ専用**で、コピー後そのまま終了します。つまり
`CCLOG_ALL.md` やセッション別ファイルは生成・更新**しません**
(通常の出力が欲しいときはフラグなしで `cclog` を実行してください)。
各バックアップはセッション元の `<uuid>.jsonl` というファイル名を保つので、
後から再利用できます。`--dry-run` と併用するとコピーせずにコピー先だけを確認でき、
`--verbose` を付けると各コピー対象が表示されます。`CCLOG/` 出力ディレクトリ
(つまり `backup_jsonl/`) は通常 git 管理から除外されているため、
バックアップがリポジトリを汚すことはありません。

## 設定

出力ディレクトリ配下に `cclog.config.json`
(`<project>/CCLOG/cclog.config.json`) を置くと挙動を変えられます。

```json
{
  "extraCwds": [
    "C:\\Users\\you\\projects\\another-project",
    "/home/you/projects/another-project"
  ],
  "extraLogDirs": [],
  "recursive": false,
  "includeSidechain": false,
  "recoverSlashCommandBody": true,
  "outputAllFileName": "CCLOG_ALL.md",
  "outputSessionFilePrefix": "CCLOG_",
  "template": "templates/japanese.md"
}
```

Windows ではバックスラッシュをエスケープしたパス (`C:\\Users\\...`)、
Ubuntu / macOS ではスラッシュ区切りのパス (`/home/you/...`) を使ってください。

| フィールド                 | 説明                                                                       |
|----------------------------|----------------------------------------------------------------------------|
| `extraCwds`                | このログにマージしたい、追加のプロジェクトディレクトリ。                     |
| `extraLogDirs`             | `~/.claude/projects/...` を直接指定する形式の追加ログディレクトリ。          |
| `recursive`                | `true` にすると各ログディレクトリのサブフォルダ (サブエージェント等) も走査。 |
| `includeSidechain`         | `true` にするとサブエージェント / サイドチェーンのペアも出力に含めます。      |
| `recoverSlashCommandBody`  | `true`(既定)のとき、Claude Code がログ上で途中までしか記録しなかったスラッシュコマンドの質問本文を、そのコマンド自身の `commands/<name>.md` を Read した完全なテキストで復元します。 |
| `outputAllFileName`        | 集約出力ファイル名。デフォルト `CCLOG_ALL.md`。ファイル内の見出しはこのファイル名 (拡張子除く) から生成されます (例: `cclog.md` にすると見出しも `# cclog` になります)。 |
| `outputSessionFilePrefix`  | `--per-session` で書き出す 1 セッション 1 ファイル形式のファイル名接頭辞。デフォルト `CCLOG_` (= `CCLOG_<sessionId>.md`)。空文字列にすれば接頭辞なし。 |
| `template`                 | Markdown テンプレートのパス。cclog 同梱の `templates/` を先に探索し、なければ CCLOG ディレクトリを探します。 |

### テンプレート

同梱テンプレートは 6 種類です:

- `templates/english.md` (デフォルト)
- `templates/japanese.md`
- `templates/english-with-progress.md`
- `templates/japanese-with-progress.md`
- `templates/english-with-progress-full.md`
- `templates/japanese-with-progress-full.md`

テンプレートでは以下のプレースホルダが使えます:

| プレースホルダ    | 置換内容                                                     |
|-------------------|--------------------------------------------------------------|
| `%DateTime%`      | 質問のタイムスタンプ (`YYYY/MM/DD Day HH:MM:SS`)             |
| `%SessionId%`     | セッション UUID                                              |
| `%SessionName%`   | 人間可読なセッション名。ユーザ設定のカスタムタイトルがあればそれ、無ければ Claude Code の自動生成タイトル、どちらも無ければ空 |
| `%Question%`      | ユーザのメッセージ                                          |
| `%Answer%`        | Claude の応答                                               |
| `%Progress%`      | (任意) Q と A の間のツール呼び出し（**要約**）              |
| `%ProgressFull%`  | (任意) 同上。ただし input/output の全 JSON と thinking 付き |

進捗セクションを出すかどうか・どこまで詳しく出すかは、テンプレートだけで決まります:

- どちらも含まない → ツール呼び出しは省略;
- `%Progress%` を含む → 要約（ツール名＋主要な引数、結果は先頭のみ）;
- `%ProgressFull%` を含む → input/output の全 JSON と thinking ブロック。

2 つの進捗プレースホルダは片方だけを使ってください（両方は併用しません）。
コマンドラインオプションでの制御はなくなり、詳しさはテンプレートに従います。

#### テンプレートをカスタマイズする

グローバルインストールされた cclog のファイルを触らずにテンプレートを
編集したいときは、以下を実行してください:

```bash
cclog --init-template
```

これは `cclog.config.json` の `template` に書かれているテンプレート
(config が無ければ英語版がデフォルト) を `CCLOG/templates/` にコピーし、
config を書き換えてローカルコピーを参照するようにします:

```diff
- "template": "templates/japanese.md"
+ "template": "CCLOG/templates/japanese.md"
```

あとは `CCLOG/templates/japanese.md` を直接編集してください。
コピー先のファイルがすでに存在する状態で `--init-template` を再実行すると、
エラー表示してコピーはスキップ (上書きしません) しますが、config の
書き換えだけは行います。

## 出力フォーマット

`CCLOG_ALL.md` は Q&A ブロックがフラットに時系列で並びます。各ブロックは
テンプレートに従って整形されます (デフォルトの英語テンプレート例):

```markdown
# 2026/05/27 Wed 11:03:49

Session: ec5e9974-80a6-4baa-a701-0e29589674da

## Question

Hello, can you help me with X?

## Answer
<!--
Sure, here's how...
-->

----------------------------------------
```

`<!-- -->` で回答を囲んでいる主な理由は、Claude の回答に含まれる
Markdown 書式 (見出し・リスト・コードブロックなど) がテンプレートの
Markdown 構造とぶつかるのを防ぐためです。コメントで囲むことで
テンプレート側のレイアウトが崩れません。副次的な効果として、
Markdown ビューアで長い回答が畳まれて表示されるので、プレビューが
回答に埋め尽くされにくくなります。常に展開して見たい場合は
テンプレートから外してください。

## 注意事項

- 出力は毎回完全に再生成されます。`~/.claude/projects/...` 配下の
  セッションログを削除すると、次回 `cclog` 実行時に `CCLOG_ALL.md` から
  該当ペアも消えます。
- **上書き前の Markdown バックアップ。** 既存の `CCLOG_*.md` が
  *全書き換え*（追記ではない変更。例: 別の PC で実行して同期済みの
  `.md` がローカルの `.jsonl` と一致しない、テンプレートを変更した、
  など）になる場合、上書きの直前に既存ファイルを
  `CCLOG/backup_CCLOG_md/<yyyy-mm-dd_hh-mm-ss>_<hostname>/` へコピーします。
  これにより以前の版が失われません。通常の追記・変更なしの実行・初回作成
  ではバックアップを取らないので、このフォルダは実際に上書きが発生した
  ときだけ作成されます。

## ライセンス

MIT
