# カード管理 v0.3.3｜Google Driveアカウント別バックアップ

## 仕様

- アプリのOAuthクライアントIDは**アプリ共通**。一般利用者が入力するものではない。クライアントシークレットは使わない。
- 「暗号化してDriveへ保存」「Driveから復元」のたびに、Googleアカウント選択画面を表示する（Google Identity Services `prompt: select_account`）。
- 同じアプリでも、利用者AがAアカウントを認証すればAのDrive、BがBアカウントを認証すればBのDriveへアクセスする。アカウント選択は**本人操作**とする。
- 選択したGoogleアカウントのメールアドレスをGoogle Drive API `about.get` で確認し、**保存直前にメールアドレスを表示して最終確認**する。確認を拒否したら**アップロードしない**。復元一覧・確認にもアカウントを表示する。
- 権限は `https://www.googleapis.com/auth/drive.file` のみ。Drive全体へのアクセス権限は要求しない。アカウントを識別できない場合は安全停止する。
- Driveに送るカードデータは従来どおり **PBKDF2-HMAC-SHA256（600,000回）＋AES-256-GCMの暗号化JSON** のみ。アクセストークン・PIN・暗号化パスフレーズはバックアップに含めない。アクセストークンはメモリ内だけで使用する。
- **Googleアカウントと端末データは別管理**。同じブラウザ・同じオリジンではIndexedDBのカード情報が共有され、Googleアカウントを切り替えてもカード情報が利用者別に自動分離されるわけではない。共用端末ではブラウザプロフィールを分けるか、別端末を使う。
- クラウドへの自動同期・定期バックアップ・Drive上のファイル自動削除はなし。クラウドへの操作は本人が押したときだけ行う。

## 公開サイトとOAuth設定

- GitHub Pages: `https://goroyattemiyo.github.io/credit-card-usage-manager/`
- Google Cloud Consoleの「承認済みのJavaScript生成元」：`https://goroyattemiyo.github.io`（URLのパスは含めない）、ローカルテストでは `http://localhost:8765`。
- 利用するGoogle Cloudプロジェクトで**Google Drive APIを有効化**し、OAuthクライアント種別を**ウェブ アプリケーション**にする。
- **複数の一般ユーザーに使ってもらうには、Google Auth Platform → 対象で「External（外部）」を設定し、Googleの公開ステータスを確認すること**。Testing（テスト）では、許可されたテストユーザーしか利用できない。External / In productionの場合も、Google側のブランド認証・公開審査などが求められることがある。これはアプリのコードとは別のGoogle Cloud設定で、現時点で実際のステータスは未確認。
- クライアントIDの変更画面は一般利用者には不要なためv0.3.3で撤去。以前にローカル保存した別IDも使用せず、アプリ共通IDを使う。

## 実機テスト手順（最初は架空のカードのみ）

| ID | テスト | 合格条件 |
|---|---|---|
| U01 | Google認証設定画面を探す | 存在しない。クライアントIDは入力不要 |
| U02 | Aで暗号化保存 → アカウント選択 | Aが選べる。保存直前にAのメールアドレスを確認できる |
| U03 | Aの保存先確認でキャンセル | AのDriveにファイルを作成しない。再度認証できる |
| U04 | Aで保存を承認 | 暗号化JSONだけがAのDriveに保存され、再取得照合が成功 |
| U05 | Bで保存 | Bのメールアドレスを表示し、BのDriveにだけ保存される |
| U06 | Aで復元一覧、次にBで復元一覧 | アカウントごとのファイルだけ表示される。誤ってAのバックアップをBの一覧に出さない |
| U07 | A/Bそれぞれから復元 | 復元元アカウントを確認でき、復号・検査・最終承認後にだけ端末のデータが置き換わる |
| U08 | 認証拒否、権限不足、ネットワーク切断、アカウント識別不能 | 保存・復元せずエラー。既存の端末データは保持される |
| U09 | 画面ロック、認証ポップアップ中断 | 既存のセッションが失われた場合、安全に中止 |
| U10 | 従来のローカルJSON書き出し・読み込み | 従来どおり動作する |
| U11 | PWA再読み込み | バージョン0.3.2、Service Workerキャッシュもv0.3.3 |

## 注意点

- 端末内のIndexedDBは**暗号化されない**。4桁PINは画面操作の制限であり、保存データの暗号化ではない。
- Driveに作成する暗号化バックアップの**パスフレーズを紛失すると復元不能**。
- 通信失敗時にアップロードが成功済みの可能性があるため、すぐに再送信せずDriveの一覧で重複確認する。
- アプリが作成したバックアップを扱う `drive.file` なので、別OAuthアプリで作った旧ファイルは表示されない場合がある。
- Googleが利用者を識別できない状態ではバックアップを実行しない。
- PWAのアプリ資産更新通信とGoogle認証ライブラリ読み込みは発生し得る。カードデータのGoogle送信はバックアップ操作時のみ。

## 検証状態

- Node.js構文検証：PASS
- 2つのGoogleアカウントを模擬したアカウント選択・保存／一覧／読取・誤操作／異常系：28項目PASS（実コードの関数を使った模擬テスト）
- Google実認証・実Drive API操作・2アカウントの実機検証：**未検証**
- Google Auth PlatformのExternal/Testing/Productionステータス：**未確認**

参考：
- [Google Identity Services TokenClient.prompt](https://developers.google.com/identity/oauth2/web/reference/js-reference)
- [Drive API about.get](https://developers.google.com/workspace/drive/api/reference/rest/v3/about/get)
- [Drive API権限とdrive.file](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [OAuthアプリ公開ステータス](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)

## パスワード管理画面との干渉対策 (v0.3.3)
- バックアップ用パスフレーズやPIN変更画面で、Chromeなどのパスワード選択UIが一時的にページ非表示を起こしても、20秒以内なら入力ダイアログを維持する。
- 一時非表示の間はアプリ全体を隠す。20秒以上の非表示・5分間の無操作・ページ移動・パスワード欄以外からの画面切替は従来どおりロックする。
- パスワード欄を含むダイアログでは、外側クリックやEscapeで閉じず、×またはキャンセルで閉じる。
- 実ブラウザでのパスワードマネージャー候補選択は端末・ブラウザ実機で要確認。

テスト手順（Node.js 18以上、通信不要）:

```sh
node tests/password-manager-modal.test.cjs
node tests/service-worker.test.cjs
```
