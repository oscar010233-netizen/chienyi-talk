# DB 現況與約定（給後續 AI agent / 開發者）

> 最後更新：2026-06-15。本檔記錄「光看 schema 看不出來」的真相，動 DB 或寫程式前先讀。
> Schema 欄位清單的單一事實來源在 `lib/db/schema.ts`，並可在前端 `/db` 頁即時檢視。

## 近期已執行的變更

1. **`student_task_records.lamp` 欄位已移除。**
   燈號不再存 DB，一律由前端用 `lampFor(status, task_type)`（`lib/grade/status.ts`）即時計算。
   不要再 select / insert / update `lamp`。

2. **`schedule_event_students` 表已 DROP。**
   原為「補課/個別安排」預留，零程式碼引用。要復用直接重跑 migration `20260614000002_schedule_tables.sql` 內對應段落即可。

3. **新增 `audit_log` 表 + `zz_audit` 觸發器。**
   掛在所有業務表上（after insert/update/delete），自動記錄 op / row_id / changed_columns / old_data / new_data / actor。
   前端 `/db` 頁即時顯示。注意：因 app 全用 service role，`actor` 多半是 `postgres`，不是真人。

4. **`/api/task-records` PATCH 不再接受 `status` / `lamp`。**
   狀態變更一律走 `/api/reinforcement/tasks`（內含 `resolveTaskSubmission` 狀態機）。`/api/task-records` 只能改 latest_result / result_history / teacher_note / comment_text / comment_status。

## 不能動的東西

- **`profiles`**：RLS policy（`tenant members can manage`）靠它判斷 tenant 歸屬，是整個權限體系的根。app 程式碼不直接讀寫它（用 service role 繞過 RLS）≠ 沒用。**不可刪。**
- **`schedule_event_teachers`**：被 `/api/schedule/events` GET 的 `teachers:schedule_event_teachers(*)` join 著。目前 0 筆、無寫入 UI，是「多老師排課」路線圖預留。直接 DROP 會讓配課表查詢爆掉——要砍必須先移除該 join。

## 已知缺口 / 殭屍欄位（不是 bug，是待補）

- **`classes.department` 從來沒有寫入點**（CreateClassModal 無此欄）。所有班級 department 皆為 null，導致 buffer 頁 `sourceFromDepartment()` 永遠回傳 `ENG`，**ENG/XIAO 來源分類與篩選實質失效**。正解是補 department 輸入 UI，不是刪欄。
- **從不寫入的欄位**：`schedule_days.note`、`students.note`、`day_entries.notes`、`day_entries.sort_order`（排序實際靠 created_at）。屬無害冗餘，未來要用再接 UI。
- **`payment_bag_lines`** 的 `issue_status` / `paid_amount` / `handler` / `payment_status` / `intro_card_received`：有 API（billing `update-line` action）但**無任何 UI 觸發**。繳費袋只顯示不可改。帳務 UI 待重寫。
- **DB 預設值欄位**（非 app 寫入，勿誤判為「有在用」）：各表 `status`（rooms/schedule_days/schedule_events… 有 DEFAULT）、`updated_at`（trigger 自動維護）。

## 對 DB 跑 DDL 的方法

`.env.local` 只有 URL + anon + service-role key，**無 DB 密碼 / 無 CLI**。
service-role key 可走 PostgREST 讀寫資料，但**不能跑 DDL**。
DDL 走 Management API：在已登入的 Supabase dashboard 分頁取 `localStorage["supabase.dashboard.auth.token"].access_token`，
`POST https://api.supabase.com/v1/projects/pmoyvpnbbitnigchvluz/database/query`，body `{"query":"<sql>"}`，成功回 201 + `[]`。
