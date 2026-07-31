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
- 可在指定日期提出請假。
- 班群與教師私訊皆支援文字、圖片、未讀提醒、送出中／失敗提示及重試。
- 自己送出的文字或圖片可軟收回，畫面改顯示「訊息已收回」。
- 可向教師提出五分鐘內有效的緊急單一語音通話申請。
- 可透過手機瀏覽器加入桌面，作為網頁捷徑使用。

### 教師端

- 同一登入入口依教師帳號自動分流。
- 行事曆採月覽與當日事項分區：新增、修改、刪除、設定假日，以及一鍵設定當月週六／週日為假日。
- 可讀取學校行事曆，挑選匯入後仍能獨立修改班級行事曆資料。
- 聯絡簿集中顯示待簽、已簽、未簽與請假統計；未簽採紅色提示，可篩選名單並快速私訊。
- 班群與個別家長私訊支援圖片、未讀提醒、失敗重試及軟收回。
- 相簿支援教師以 iPhone 等手機單張上傳；上傳成功後會回到可再次上傳的初始狀態。
- 可從家長的通話申請發起一對一網頁語音通話。

## 系統架構

| 元件 | 職責 |
| --- | --- |
| GitHub Pages | 發布 `index.html`、`guardians.html`、`teacher.html` 與 PWA 資源。推送 `main` 後自動更新。 |
| Firebase Firestore | 儲存各學期的聯絡簿、行事曆、簽閱／請假、班群、私訊、相簿資料與未讀狀態，並提供即時同步。 |
| Google Apps Script | 統一登入、教師／家長權限判斷、圖片上傳、學校行事曆讀取，以及語音通話訊號交換。 |
| Google 試算表 | 保存家長帳號、驗證碼與學生名單。 |
| Google Drive | 保存班級相簿與聊天圖片。 |
| Metered.ca TURN／STUN 服務 | 目前的語音通話連線服務，協助教師與單一家長建立 WebRTC 音訊連線；僅用於緊急情境。 |

目前前端依日期自動選擇 `114-02`、`115-01` 或 `115-02` 對應的 Firebase 學期資料。聊天資料跨學期共用，以保留對話紀錄。

## 專案檔案

| 檔案 | 說明 |
| --- | --- |
| `index.html` | 統一登入頁，依身份導向教師或家長端。 |
| `guardians.html` | 家長端介面與 Firebase 即時資料處理。 |
| `teacher.html` | 教師端介面與日常管理功能。 |
| `manifest.webmanifest`、`service-worker.js` | 安裝為手機桌面捷徑與基本離線快取。 |
| `app-icon-*`、`apple-touch-icon.png`、`807.png` | 網站與桌面捷徑圖示資源。 |
| `統一後端.gs`（本機／Apps Script） | Apps Script 後端程式；不作為 GitHub Pages 前端部署內容。 |

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

請只在 Apps Script 指令碼屬性設定實際帳密與 TURN 憑證，勿將它們寫入 HTML、README 或 GitHub。

## 使用提醒

- 教師與家長都只應使用自己的帳號登入。
- 收回訊息採「軟收回」：畫面隱藏原內容，但不刪除 Firebase 訊息文件或 Google Drive 圖片檔，以保留紀錄與降低誤刪風險。
- 語音通話為一位教師對一位家長，不含視訊、多人通話或錄音；建議僅用於緊急聯繫。
