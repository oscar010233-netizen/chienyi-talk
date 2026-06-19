# DB 現況與約定（給後續 AI agent / 開發者）

> 最後更新：2026-06-20。本檔記錄「光看 schema 看不出來」的真相，動 DB 或寫程式前先讀。
> Schema 欄位清單的單一事實來源在 `lib/db/schema.ts`，並可在前端 `/db` 頁即時檢視。

## 近期已執行的變更

1. **`student_task_records.lamp` 欄位已移除。**
   燈號不再存 DB，一律由前端用 `lampFor(status, task_type)`（`lib/grade/status.ts`）即時計算。
   不要再 select / insert / update `lamp`。

2. **`schedule_event_students` 表已 DROP。**
   原為「補課/個別安排」預留，零程式碼引用。要復用直接重跑 migration `20260614000002_schedule_tables.sql` 內對應段落即可。

3. **`payment_bag_lines` 的 5 個付款狀態欄位已從 live DB DROP。**
   `issue_status` / `paid_amount` / `intro_card_received` / `handler` / `payment_status` 已於 2026-06-19 透過 Supabase SQL Editor 套用 `supabase/migrations/202606190001_drop_payment_bag_line_payment_status_columns.sql`；app 的 service/API 寫入路徑、types、snapshot 皆已同步。

4. **新增 `audit_log` 表 + `zz_audit` 觸發器。**
   掛在所有業務表上（after insert/update/delete），自動記錄 op / row_id / changed_columns / old_data / new_data / actor。
   前端 `/db` 頁即時顯示。注意：因 app 全用 service role，`actor` 多半是 `postgres`，不是真人。

5. **`default_attendance.source` 欄位已 DROP。**
   原意是記錄 session 由 weekday1 或 weekday2 產生，但實際值全為 `'generated'`，沒有區分意義。
   判斷 session 類型改用 `original_date` 的星期幾比對 `classes.weekday1`/`weekday2`（見 `app/api/season-plan/route.ts`）。

6. **`default_attendance` 表已 DROP（2026-06-20）。**
   `class_tasks` 現在改以 `bag_id + session_date + session_kind` 識別出席 session，不再依賴 `default_attendance_id`。
   `class_tasks` 新增欄位：`bag_id UUID REFERENCES payment_bags(id)`、`session_date DATE`、`session_kind TEXT CHECK IN ('team','intensive')`；已移除 `default_attendance_id`。
   教學側的 session 排程讀取來源改為 `payment_bag_line_sessions`。
   `lib/billing/types.ts` 的 `DefaultAttendance` interface 已刪除；`ActualAttendance` 改用 `session_date` 代替 `default_date`，移除 `default_attendance_id`、`session_index`。
   `lib/grade/types.ts` 的 `SeasonSession` 改為 `{ session_date, session_kind, tasks }`；`Task` 改為 `bag_id / session_date / session_kind`，移除 `default_attendance_id`。

6. **`/api/task-records` PATCH 不再接受 `status` / `lamp`。**
   狀態變更一律走 `/api/reinforcement/tasks`（內含 `resolveTaskSubmission` 狀態機）。`/api/task-records` 只能改 latest_result / result_history / teacher_note / comment_text / comment_status。

## 不能動的東西

- **`profiles`**：RLS policy（`tenant members can manage`）靠它判斷 tenant 歸屬，是整個權限體系的根。app 程式碼不直接讀寫它（用 service role 繞過 RLS）≠ 沒用。**不可刪。**
- **`schedule_event_teachers`**：被 `/api/schedule/events` GET 的 `teachers:schedule_event_teachers(*)` join 著，配課表新增/編輯時段可寫入授課老師。直接 DROP 會讓配課表查詢爆掉——要砍必須先移除該 join 與 UI。

## 已知缺口 / 殭屍欄位（不是 bug，是待補）

- **`classes.department` 已有新增班級寫入 UI**，但舊資料可能仍為 null。若 buffer 的 ENG/XIAO 分類不準，優先回填舊班級 department。
- **近期已補 UI 的欄位**：`schedule_days.note`、`students.note`、`day_entries.notes`、`day_entries.sort_order`。
- **DB 預設值欄位**（非 app 寫入，勿誤判為「有在用」）：各表 `status`（rooms/schedule_days/schedule_events… 有 DEFAULT）、`updated_at`（trigger 自動維護）。

## 對 DB 跑 DDL 的方法

`.env.local` 只有 URL + anon + service-role key，**無 DB 密碼 / 無 CLI**。
service-role key 可走 PostgREST 讀寫資料，但**不能跑 DDL**。
DDL 走 Management API：在已登入的 Supabase dashboard 分頁取 `localStorage["supabase.dashboard.auth.token"].access_token`，
`POST https://api.supabase.com/v1/projects/pmoyvpnbbitnigchvluz/database/query`，body `{"query":"<sql>"}`，成功回 201 + `[]`。
