# カード管理 v0.3.1｜Google Drive暗号化バックアップ設定・実機検証

## 確定した仕様変更
- カード情報の主保存先は従来どおり端末内IndexedDB（平文・PINは画面制御のみ）。
- 外部通信は、Google Driveへの**手動バックアップ／復元**操作時のみ許可（Google Identity Services認証 + Google Drive API）。PWAの同一配信元のアプリ資産更新通信は別途発生し得る。
- Driveへ送るのは **AES-256-GCM / PBKDF2-HMAC-SHA256 600,000回で暗号化したJSONだけ**。PINのハッシュ・Googleアクセストークン・パスフレーズはJSONに含まれない。
- クラウドへの自動同期、自動バックアップ、Google Drive上の平文JSON、Drive内のファイル自動削除は実装しない。

## 本人が一度だけ行うGoogle Cloud設定（まだ未実施）
1. [Google Cloud Console](https://console.cloud.google.com/) で本人管理のプロジェクトを選択または作成。
2. **Google Drive API**を有効化。
3. Google Auth Platform（OAuth同意画面）のアプリ名と対象ユーザーを設定。External / テスト運用の場合は本人のGoogleアカウントを**テストユーザー**に追加。個人利用を超える公開はしない。
4. OAuthクライアントを**ウェブアプリケーション**種別で作成。
5. 「承認済みのJavaScript生成元」にテスト用 `http://localhost:8765` と `http://localhost` を追加。将来HTTPS配信で使う場合は、そのサイトの正確なオリジン（例：`https://example.com`）も追加する。`file://`、IPの異なるオリジン、任意のPrivate GitHub URLをそのまま登録しても動作しない。
6. ウェブ用OAuthクライアントIDはアプリに**既定値として設定済み**。普段はアプリでの手入力は不要。別のGoogle Cloudプロジェクトに切り替えるときだけ「設定・データ → Google認証の設定」で変更する。**クライアントシークレットは入力・配置しない**。

クライアントIDは公開識別子としてアプリのHTMLに既定値を同梱し、端末側で別IDを上書き設定した場合のみIndexedDBへ保存する。JSONバックアップには含めない。OAuthアクセストークンは操作中のメモリだけで使用し、永続保存しない。

**重要：** Google CloudのOAuth設定や実際のアカウント認証はChatGPT側では完了していません。実ブラウザでの本人操作が必要です。Google認証にはHTTPSまたはlocalhostが必要です。Android/iPhoneへPWAとして導入するための**非公開HTTPS配信方法**は未決定です。GitHub Pages公開は行っていません。

## ローカルでの起動（Windows・Python導入済み）
ZIP内の `index.html`・`manifest.json`・`sw.js`・`icons/` を同じ階層に展開。

```powershell
cd <展開したフォルダ>
py -m http.server 8765 --bind 127.0.0.1
```

Chromeで `http://localhost:8765/index.html` を開く。ターミナルを閉じると配信は停止する。ブラウザには既存の同一オリジンのIndexedDBが残るため、**テスト専用ブラウザプロフィール／架空データ**を使う。既存データに実データがある場合は最初に暗号化JSONを別途保存する。

## 実機チェック項目

| ID | 確認操作 | 合格条件 |
|---|---|---|
| U01 | PIN設定、架空カードを登録、画面再読み込み | IndexedDBデータとPINロックが保持される |
| U02 | ネット切断でアプリを通常操作 | カード一覧・編集は使用可能、Drive操作はエラーになる |
| U03 | 設定→Google認証設定→既定OAuthクライアントIDを確認 | 既定IDが表示され、シークレット入力欄は存在しない |
| U04 | 暗号化してDriveへ保存→パスフレーズ入力→準備→Google認証 | GoogleがDriveファイル権限だけを要求。認証拒否時は未送信 |
| U05 | Driveアップロード完了 | `.json.enc`が**自分のDrive**に作られる。アプリは再取得一致を検証して完了を表示 |
| U06 | Google Drive内で保存ファイル確認 | 暗号化ヘッダーとciphertextのみ。カード名・番号・PINハッシュは平文で出ない |
| U07 | Driveから復元→ファイル選択→正しいパスフレーズ→確認 | カード件数プレビュー→最終確認→置換→PIN再設定 |
| U08 | Drive復元で誤ったパスフレーズ | 復元拒否、端末の既存カードは変更されない |
| U09 | Google認証拒否、通信遮断、5分ロック | Drive操作は失敗として表示。トークンをIndexedDB/localStorageへ書き込まない |
| U10 | 同一端末のローカルJSON書き出し・読み込み | 既存ローカルバックアップ機能に回帰がない |
| U11 | `file://`から開きGoogle Drive操作 | 安全な配信が必要との案内。その他のローカル画面は使える |
| U12 | PWA更新 | v0.3.1が表示され、Service Workerキャッシュがv0.3.1に更新される |

## 制約・リスク
- **PINはデータ暗号化ではない。** IndexedDBは平文のまま。Google Driveへ送信するJSONのみ暗号化。
- **パスフレーズ紛失では復元不可能。** Google側でも復号できない。別途安全に管理する。
- **Driveで作るファイルは追加保存方式。** 誤アップロードや通信中断後のリトライでは重複に注意する。保存後の再取得・照合に失敗してもアップロード済みの可能性がある。
- **drive.fileスコープ**では原則として同じOAuthアプリが作成したファイルだけを扱う。他のOAuthクライアントIDを使って作った旧バックアップはアプリ一覧に出ない場合がある。その場合はDriveからファイルを端末にダウンロードして、従来の「JSONを読み込んで復元」を使用する。
- バックアップ一覧は最新100件まで。追加のページ読み込みは未実装（個人利用MVPの範囲）。
- Google Cloud同意画面のテストモード・OAuthクライアントIDの設定・Google側の利用制限によって実機認証が失敗する場合がある。
- 静的HTML配信のため、Google SDKを読み込む際にはGoogleの認証用JavaScriptが通信される。これはGoogle Drive操作開始時のみ遅延ロードする。

## 未検証と公開判断
- OAuthのGoogle実アカウントでの認可：**未検証（クライアントIDは設定済み。Google Cloudの許可オリジン・テストユーザー登録および本人操作が必要）**。
- Google Drive APIの実アップロード／復元：**BLOCKED（実Google認証未実施）**。
- Android/iOSインストール・非公開HTTPS：**未検証／要判断**。
- ブラウザE2E：実行環境の管理ポリシーでlocalhostへのChromiumナビゲーション不可。**未検証**。
- 静的検証・API模擬テスト：レポートの実測件数を参照。

参考：
- [Google OAuthクライアントIDの作成](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid)
- [Google Identity Services token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [Drive OAuthスコープ](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Drive multipart/resumable upload](https://developers.google.com/workspace/drive/api/guides/manage-uploads)
