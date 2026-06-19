# Claude Handoff - 2026-06-19

本文件整理 Claude Code token 用完前的三個未收斂 thread，以及 Codex 接手後已完成的檢查。

## 來源

- Claude 專案記錄：`%USERPROFILE%\.claude\projects\C--Users-oscar`
- 主要 thread：
  - `a40af17b-e92a-4ebb-8f3a-b4ba2699393f`：`1 改班級任務UI`
  - `17ea0f47-d67d-47f7-9336-1c18e5f5bb90`：`2 處理配課表UI`
  - `0e413481-332d-4e6b-97d3-282dee43c92b`：`3 處理!`

## 目前驗證狀態

- `npm run lint`：通過，剩既有 warnings。
- `npm run build`：通過。曾因 Next dev server 的 `.next/dev` cache 造成暫時錯誤；停止 dev server 並清掉 `.next` 後 build 通過。
- 本機 dev server 已啟動：`http://localhost:3000`。
- 已確認 `http://localhost:3000/workspace` 與 `http://localhost:3000/classes` 回 200。
- 尚未 commit / push 本次接手後的變更。

## 1. 改班級任務 UI

### 使用者核心方向

- 不要為了畫面方便隨便加 `class_tasks.session_date`。
- 出席 / `default_attendance` 是整季課程的骨架。
- 班級任務 UI 要讓老師能先填整季預計任務，而不是受 Google Sheet 舊格式限制。

### 已完成或已存在

- `season-plan` 已接 `default_attendance` 與 `class_tasks`。
- 已經有整季任務表的基礎畫面。
- Claude 曾完成強化欄的互動圈圈：以 week occurrence 決定強化數量，不再靠手動輸入精修數字。

### 仍要注意

- `default_attendance.source` 已被 DB drop；目前 route 改用 `original_date` 的 weekday 對應 `classes.weekday1/weekday2` 來推斷團課 / 強化。
- 這個推斷在遇到調假、補課、跨日調整時可能不夠穩。後續若要嚴謹，應該補一個明確且可維護的 session type 來源，而不是回到不可靠的 `source` 字串。
- Claude 最後有提到某班 sessions 是空的，需要重新開袋 / repopulate session data 後，季計畫表才會有資料。

## 2. 處理配課表 UI

### 使用者需求

- `schedule_event_teachers` 要支援同一堂課分時間顯示不同老師。
- 例：`19:30-20:15` A 老師，`20:15-21:00` B 老師，在配課表上是兩格不同顏色，但仍屬於同一堂課。

### 已完成或已存在

- 新增 `/api/profiles`，供老師選單使用。
- `/api/schedule/events` GET join `schedule_event_teachers` 與 `profiles`。
- POST / PATCH 會寫入 teacher segments。
- DELETE event 前會先刪 teacher segments，避免 FK 問題。
- `ScheduleGrid` 已能依 teacher segment 畫出子區塊。
- `CreateEventModal` 目前有基本老師多選，但還不是完整的分段時間 UI。

### Codex 接手後補強

- POST teacher insert error 不再被吞掉，會回 API 錯誤。
- PATCH 使用既有 event 的 `tenant_id`，不再用第一個 tenant 當 fallback。
- PATCH teacher sync 有錯誤會中止並回錯。
- `CreateEventModal` 已從老師多選改成老師分段 editor：
  - 每列可選老師、開始時間、結束時間、顏色。
  - 儲存前會檢查分段不得超出整堂課時間、結束需晚於開始、分段不可重疊。
  - `ScheduleGrid` 會把同一堂課中的不同老師分段上下切成不同顏色。
- Dev preview middleware 已放行 `/api/profiles` 與 `/api/day-entries`，否則 workspace 未登入預覽時會拿到 login HTML。
- 已用 API smoke test 建立一筆臨時事件，含兩段老師時間與顏色；GET 重載驗證成功後已刪除測試事件。

### 未完成

- 還沒有用真實瀏覽器登入 session 做手動點擊測試；目前完成的是 API 級新增 / 讀取 / 刪除 smoke test。

## 3. 處理 DB 監看頁驚嘆號

### 已完成或已存在

- DB monitor icon 已由誤導的驚嘆號改成 info icon。
- `classes.department` 已補 UI。
- `students.note` 已補 UI。
- `schedule_days.note` 已補 workspace UI。
- `day_entries.notes` 與 `day_entries.sort_order` 已接 UI / API，用於待辦與晚餐項目備註、拖曳排序。
- `payment_bag_lines` 的付款狀態類 zombie 欄位已從 service / API 寫入路徑移除。
- 已新增 migration：`supabase/migrations/202606190001_drop_payment_bag_line_payment_status_columns.sql`。

### Codex 接手後補強

- `day_entries` POST 現在會寫 `sort_order`。
- `day_entries` PATCH allowlist 已包含 `sort_order`。
- `/db` 頁 React lint 問題已修掉。

### 仍要注意

- `lib/db/database.types.ts` 已移除 `default_attendance.source`，並補上 `class_tasks.default_attendance_id`。
- `payment_bag_lines` 的 5 個付款欄位已於 2026-06-19 透過 Supabase SQL Editor 從 live DB drop：`issue_status` / `paid_amount` / `intro_card_received` / `handler` / `payment_status`。
- `lib/db/database.types.ts` 與 `docs/supabase-live-snapshot.md` 已同步為 drop 後狀態。

## 目前工作樹

本次接手後工作樹仍有未提交變更，主要包含：

- `/db` 頁 lint 修正。
- `day_entries` sort order API 補完。
- `schedule_event_teachers` API 錯誤處理補強。
- `season-plan` 移除對 `default_attendance.source` 的 select。
- 配課表老師分段 UI / render WIP。
- workspace 待辦 / 晚餐備註與拖曳 WIP。
- billing zombie 欄位移除 WIP。
- 文件更新。

## 建議下一步

1. 先完成 `CreateEventModal` 的老師分段 editor，因為這是 Claude hit limit 的直接斷點。
2. 用 browser 實測配課表新增 / 編輯 / 刪除，確認 teacher segments 正確。
3. 確認 live DB schema，更新 `lib/db/database.types.ts` 與 `docs/supabase-live-snapshot.md`。
4. 再做一次 `npm run lint`、`npm run build`。
5. commit / push，讓 Vercel 部署到最新版。
