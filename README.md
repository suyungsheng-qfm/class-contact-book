# 班級聯絡簿（807）

手機優先的班級聯絡與行事曆網站，用來集中處理每日公告、簽閱、請假、訊息、相簿與緊急語音通話，作為班級 LINE 群組以外的正式聯絡入口。

## 網站與管理入口

| 用途 | 網址 |
| --- | --- |
| 使用中的班級聯絡簿 | [GitHub Pages](https://suyungsheng-qfm.github.io/class-contact-book/) |
| 原始碼與版本紀錄 | [GitHub 儲存庫](https://github.com/suyungsheng-qfm/class-contact-book) |
| 前端自動發布紀錄 | [GitHub Actions](https://github.com/suyungsheng-qfm/class-contact-book/actions) |
| GitHub Pages 設定 | [Pages 設定](https://github.com/suyungsheng-qfm/class-contact-book/settings/pages) |
| Firebase 專案管理 | [Firebase Console](https://console.firebase.google.com/project/classcontact-c148d/overview) |
| Apps Script 管理 | [Google Apps Script](https://script.google.com/home) |
| 語音通話 TURN／STUN 服務 | [Metered.ca](https://www.metered.ca/) |
| 學校公開行事曆 | [Google Calendar](https://calendar.google.com/calendar/embed?src=qisho218odg6vcgd3up3dpp6qg%40group.calendar.google.com&ctz=Asia%2FTaipei) |

> GitHub Pages 為唯一前端來源；Apps Script 只處理後端服務，不再放置或發布 HTML 前端。

## 功能

### 家長端

- 統一入口登入後自動進入家長頁面；驗證碼欄位支援手機數字鍵盤。
- 以月曆查看每日公告、班級／學校事項、假日與簽閱狀態；可回到今天。
- 三步內完成「今天公告 → 簽閱 → 班級訊息／私訊 → 圖片」的日常流程。
- 可在指定日期填寫線上請假單、手寫家長簽名；送出時會自動私訊通知導師，簽名與資料受登入權限保護。
- 班群與教師私訊皆支援文字、圖片、未讀提醒、送出中／失敗提示及重試。
- 自己送出的文字或圖片可軟收回，畫面改顯示「訊息已收回」。
- 可向教師提出五分鐘內有效的緊急單一語音通話申請。
- 可透過手機瀏覽器加入桌面，作為網頁捷徑使用。
- 從班群的表單卡片開啟回覆頁時，會自動帶入登入身分，不需再次輸入學號或姓名。

### 教師端

- 同一登入入口依教師帳號自動分流。
- 行事曆採月覽與當日事項分區：新增、修改、刪除、設定假日，以及一鍵設定當月週六／週日為假日。
- 可讀取學校行事曆，挑選匯入後仍能獨立修改班級行事曆資料。
- 聯絡簿集中顯示待簽、已簽、未簽與請假統計；未簽採紅色提示，可篩選名單並快速私訊。
- 可從請假名單開啟含家長簽名的假單並列印；導師簽名欄保留給紙本手寫。
- 班群與個別家長私訊支援圖片、未讀提醒、失敗重試及軟收回。
- 相簿支援教師以 iPhone 等手機單張上傳；上傳成功後會回到可再次上傳的初始狀態。
- 可從家長的通話申請發起一對一網頁語音通話。
- 可建立表單、以家長視角預覽、公告連結到班群、查看家長回覆、關閉或完整刪除表單。

## 系統架構

| 元件 | 職責 |
| --- | --- |
| GitHub Pages | 發布 `index.html`、`guardians.html`、`teacher.html` 與 PWA 資源。推送 `main` 後自動更新。 |
| Firebase Firestore | 儲存各學期的聯絡簿、行事曆、簽閱／請假、班群、私訊、相簿資料與未讀狀態，並提供即時同步。 |
| Google Apps Script | 統一登入、教師／家長權限判斷、核發短效 Firebase 自訂憑證、圖片上傳、學校行事曆讀取，以及語音通話訊號交換。 |
| Google 試算表 | 保存家長帳號、驗證碼與學生名單。 |
| Google Drive | 保存班級相簿、聊天圖片，以及按學生與日期歸檔的私密請假簽名。 |
| Metered.ca TURN／STUN 服務 | 目前的語音通話連線服務，協助教師與單一家長建立 WebRTC 音訊連線；僅用於緊急情境。 |

目前前端依日期自動選擇 `114-02`、`115-01` 或 `115-02` 對應的 Firebase 學期資料。聊天資料跨學期共用，以保留對話紀錄。

## 專案檔案

| 檔案 | 說明 |
| --- | --- |
| `index.html` | 統一登入頁，依身份導向教師或家長端。 |
| `guardians.html` | 家長端介面與 Firebase 即時資料處理。 |
| `teacher.html` | 教師端介面與日常管理功能。 |
| `forms.html` | 家長由班群連結開啟的表單回覆頁。 |
| `manifest.webmanifest`、`service-worker.js` | 安裝為手機桌面捷徑與基本離線快取。 |
| `app-icon-*`、`apple-touch-icon.png`、`807.png` | 網站與桌面捷徑圖示資源。 |
| `yssu.png` | 教師專用頭像，用於家長端的班群與私訊教師訊息。 |
| `統一後端.gs`（本機／Apps Script） | Apps Script 後端程式；不作為 GitHub Pages 前端部署內容。 |
| `firestore.rules` | Firebase Firestore 的存取規則；發布前請貼入 Firebase Console。 |

## 發布與維護

### 前端

1. 修改前端檔案後提交並推送至 `main`。
2. GitHub Actions 會自動發布 GitHub Pages。
3. 在 Actions 確認工作流程成功後，重新整理網站即可取得新版。

### Apps Script 後端

後端程式僅在帳密驗證、上傳、行事曆讀取或語音通話邏輯變更時才需要更新。部署為網頁應用程式時，採用「以部署者身分執行」與「任何人」可存取，前端透過既有 API 位址呼叫。

Apps Script 的「指令碼屬性」至少需要設定：

- `TEACHER_ACCOUNT`
- `TEACHER_PASSWORD`
- `VOICE_TURN_URLS`（Metered.ca 提供的 TURN 位址）
- `VOICE_TURN_USERNAME`（Metered.ca 使用者名稱）
- `VOICE_TURN_CREDENTIAL`（Metered.ca 密鑰）
- `FIREBASE_SERVICE_ACCOUNT_EMAIL`（Firebase／Google Cloud 服務帳號的電子郵件）

請只在 Apps Script 指令碼屬性設定實際帳密與 TURN 憑證，勿將它們寫入 HTML、README 或 GitHub。

### 線上請假單（需手動發布後端與規則）

家長送出請假單時，系統會在 Google Drive 的聊天圖片根資料夾下建立 `學號 / leave / YYYY-MM-DD`，保存一份不對外分享的家長簽名 PNG；列印使用的簽名資料則受 Firestore 登入權限保護，僅該家長與教師可讀取。

啟用前請：

1. 將本機 `統一後端.gs` 完整貼到 Apps Script，重新部署網頁應用程式。
2. 將本機 `firestore.rules` 全部貼到 Firebase Console 的「Firestore Database → Rules」並發布。
3. 以家長建立一筆未來日期的請假單，確認教師端「聯絡簿 → 請假」可按「假單」開啟列印視窗。

## Firebase 權限更新（需手動操作）

這項更新會停止匿名 Firebase 存取。完成前端發布前，請依下列順序操作，以避免家長頁面無法載入。

1. 在 Apps Script 的「專案設定 → Google Cloud Platform (GCP) 專案」改綁到 Firebase 專案的**專案編號**（不是 `classcontact-c148d` 這個專案 ID）。讓 Apps Script 與 Firebase 使用同一個 Google Cloud 專案，避免 API 啟用在不同專案而造成 403。
2. 若系統要求設定 OAuth 同意畫面，選「外部」並維持「測試中」，將實際部署者帳號（目前為 `qfmstudy01@gmail.com`）加入「測試使用者」。不需送交 Google 驗證，也不需加入教師或家長帳號。
3. 在這個 Google Cloud 專案的「API 和服務」啟用 **IAM Service Account Credentials API**。
4. 選擇 Firebase 專案的服務帳號，記下其電子郵件（常見為 `firebase-adminsdk-…@classcontact-c148d.iam.gserviceaccount.com`）；不需建立或下載私密金鑰。
5. 在該服務帳號的 IAM 權限中，授予實際部署 Apps Script 的 Google 帳號 **Service Account Token Creator** 角色。
6. 在 Apps Script 開啟本機的 `統一後端.gs`，以檔案內容完整取代現有後端程式；再開啟 `appsscript.json` 並套用其中的 `oauthScopes`，其中必須包含 `https://www.googleapis.com/auth/cloud-platform`。
7. 在 Apps Script 的「專案設定 → 指令碼屬性」新增 `FIREBASE_SERVICE_ACCOUNT_EMAIL`，填入第 4 步的服務帳號電子郵件。
8. 在 Apps Script 編輯器手動依序執行 `requestCloudPlatformAuthorization` 與 `testFirebaseIamSigning`。後者顯示 `IAM signing succeeded.` 才代表 OAuth、IAM API 與服務帳戶權限都已完成。
9. 重新部署 Apps Script 網頁應用程式：選擇「管理部署 → 編輯」，建立新版本；設定為「以我身分執行」及「任何人」可存取。部署網址維持既有 API 位址即可。
10. 確認教師與一位家長可正常登入 GitHub Pages 後，在 Firebase Console 的「Firestore Database → Rules」貼上 `firestore.rules` 全部內容並發布。這一步後，匿名使用者會立刻失去資料庫存取權。
11. 以教師、家長各測試一次後，在 Firebase Console 的「Authentication → Sign-in method」停用 Anonymous。

若曾為本項目下載服務帳號 JSON 私密金鑰，請在 Google Cloud Console 將該金鑰撤銷，並自本機安全刪除；這個架構不會使用它。

完成後的驗證重點：未登入直接開啟 `guardians.html` 或 `teacher.html` 應回到統一登入頁；家長僅能看到自己的簽閱／請假與私訊；教師仍可看到全班統計與全部私訊。登入後的 Firebase 憑證由 Apps Script 核發、有效期約一小時，瀏覽器關閉後也不會保留登入狀態。

### 班級表單

表單管理只出現在教師端的「表單」分頁。新題目預設為選擇題，每題提供至少兩個選項，也可自行新增選項或題目。按「預覽」可在建立或公告前，直接查看家長端的填寫畫面；預覽不會建立表單、公告或儲存任何資料。

教師建立後按「公告到班群」，家長會在班群看到「開啟並填寫」按鈕。表單以手機逐題方式呈現，提供進度、上一步／下一步與最後的答案確認，再送出回覆。表單連結會檢查既有登入身分，自動帶入座號與姓名，每位家長只會寫入自己的回覆。表單清單與所有回覆僅教師可列出與觀看；家長只能讀取自己點開且仍開放中的單一表單，以及自己的回覆。教師刪除表單時，會一併永久刪除所有回覆；班群原有連結會改顯示表單已刪除。

首次使用前，請將新版 `firestore.rules` 全部貼到 Firebase Console 的「Firestore Database → Rules」並發布，否則表單會因權限不足無法建立或送出。

## 使用提醒

- 教師與家長都只應使用自己的帳號登入。
- 收回訊息採「軟收回」：畫面隱藏原內容，但不刪除 Firebase 訊息文件或 Google Drive 圖片檔，以保留紀錄與降低誤刪風險。
- 語音通話為一位教師對一位家長，不含視訊、多人通話或錄音；建議僅用於緊急聯繫。
