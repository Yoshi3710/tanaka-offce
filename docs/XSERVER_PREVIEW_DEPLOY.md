# Xserver 移行用の静的試作パッケージ

GitHub Actions の検証が全項目成功した実行の Artifacts に `tanaka-xserver-preview` が生成される。ローカルでは Node.js を使い、リポジトリ直下で `node scripts/build-preview.cjs` を実行する。生成される dist/ の中身は index.html、sales.html、staff.html、ocr.html、assets/logo.webp のみ。サーバー上で Node.js やビルド環境は不要。相対リンクを維持し、ドメインやサブディレクトリを固定しない。

## ステージング設置手順（未実施）

1. Xserver で試作用の非公開ディレクトリを準備し、HTTPS・アクセス制限を管理画面で確認する。
2. ZIP を展開し、対象ディレクトリに dist の中身を階層を保ってアップロードする。既存サイトを上書きしない。
3. ディレクトリ末尾の / を含む URL から起動し、担当選択、戻る、帳票、印刷、保存復元、OCR 手動経路を確認する。
4. 旧版を別の非公開場所に保存し、問題時はセット全体を戻す。個別 HTML を混在させない。
5. 正式運用に進むには別途承認が必要。

このパッケージは静的試作であり、正式な認証、サーバー側の権限検査、DB、監査、二重発注防止、バックアップは未実装。実データを入力しない。OCR は外部 CDN を使う。Xserver の本番要件は XSERVER_ROADMAP.md を参照。
