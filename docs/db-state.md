# DB 現況與約定（給後續 AI agent / 開發者）

> 最後更新：2026-06-23。本檔記錄「光看 schema 看不出來」的真相，動 DB 或寫程式前先讀。
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
   判斷 session 類型曾改用 `original_date` 的星期幾比對 `classes.weekday1`/`weekday2`；舊 `/api/season-plan` 已於 2026-06-22 移除。

6. **`default_attendance` 表已 DROP（2026-06-20）。**
   `class_tasks` 現在改以 `bag_id + session_date + session_kind` 識別出席 session，不再依賴 `default_attendance_id`。
   `class_tasks` 新增欄位：`bag_id UUID REFERENCES payment_bags(id)`、`session_date DATE`、`session_kind TEXT CHECK IN ('team','intensive')`；已移除 `default_attendance_id`。
   教學側的 session 排程讀取來源改為 `payment_bag_line_sessions`。
   `lib/billing/types.ts` 的 `DefaultAttendance` interface 已刪除；`ActualAttendance` 改用 `session_date` 代替 `default_date`，移除 `default_attendance_id`、`session_index`。
   `lib/grade/types.ts` 的 `SeasonSession` 改為 `{ session_date, session_kind, tasks }`；`Task` 改為 `bag_id / session_date / session_kind`，移除 `default_attendance_id`。

6. **`/api/task-records` PATCH 不再接受 `status` / `lamp`。**
   狀態變更一律走 `/api/reinforcement/tasks`（內含 `resolveTaskSubmission` 狀態機）。`/api/task-records` 只能改 latest_result / result_history / teacher_note / comment_text / comment_status。

7. **`class_tasks` 改用 `slot_index` 定位；`session_date` / `session_kind` / `week_label` 已 DROP（2026-06-23）。**
   `class_tasks` 現在以 `bag_id + slot_index`（對應 `payment_bag_line_sessions.slot_index`）定位「哪一堂課」，`lesson_label` 只負責「屬於哪一課」的顯示分組。三個舊欄位（過渡/遺留）已從 live DB 移除。
   - 透過 Supabase SQL Editor 分兩步套用：Step 1 先 `ADD slot_index` 並從 `payment_bag_line_sessions` 回填（以 `bag_id`+`session_date`+`session_kind` 對應）；Step 2 才 DROP 舊欄位。對應 migration 檔 `supabase/migrations/20260622000001_class_tasks_slot_index_and_templates.sql`。
   - 回填零失敗：DROP 當下表內僅 2 筆任務（皆非 attendance、attendance 任務 0 筆），有 bag 的皆成功回填，唯一 1 筆 `slot_index IS NULL` 是無 bag 的 orphan task。
   - **救援來源**：`audit_log` 仍保留 DROP 前的快照——64 筆 class_tasks 快照中 38 筆含舊 `session_date`/`session_kind`、64 筆含 `week_label`，必要時可由此重建。
   - `task_type='attendance'` 不再新建（出席事實在 `payment_bag_line_sessions`）。

8. **新增 `class_task_templates` + `class_task_template_items` 兩張表（2026-06-23）。**
   整季計畫的「任務模板」（老師可存常用任務組合，於各 session 快速帶入）。`template_items` 有 `task_type`(CHECK in homework/practice/quiz/comment/progress) + `session_position`(CHECK in S1/S2) + `sort_order`，`ON DELETE CASCADE` 綁 template。
   兩表皆已 `ENABLE ROW LEVEL SECURITY`、各 1 條 tenant 隔離 policy（`tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())`）、各 1 個 `zz_audit` 觸發器，與其他業務表一致。API 在 `app/api/task-templates/route.ts`。

## 不能動的東西

- **`profiles`**：RLS policy（`tenant members can manage`）靠它判斷 tenant 歸屬，是整個權限體系的根。app 程式碼不直接讀寫它（用 service role 繞過 RLS）≠ 沒用。**不可刪。**
- **`schedule_event_teachers`**：被 `/api/schedule/events` GET 的 `teachers:schedule_event_teachers(*)` join 著，配課表新增/編輯時段可寫入授課老師。直接 DROP 會讓配課表查詢爆掉——要砍必須先移除該 join 與 UI。

7. **出席重構：`payment_bag_line_sessions` 成為點名單一事實來源（2026-06-21）。**
   Migration `supabase/migrations/20260621000001_attendance_redesign.sql` 已套用（2026-06-21）：
   - `slot_index` 改為可 NULL（補課行無 slot）；partial unique index `uix_line_slot`。
   - 新欄位：`is_billable BOOLEAN NOT NULL DEFAULT TRUE`、`makeup_for_session_id UUID`、`attendance_status TEXT`、`absence_resolution TEXT`、`attendance_note TEXT`、`attendance_updated_at TIMESTAMPTZ`。
   - `session_kind` CHECK 擴充含 `'makeup'`。
   - 5 個 RPC：`fn_reopen_bag`、`fn_bulk_mark_attendance`、`fn_create_makeup_session`、`fn_mark_makeup_attendance`、`fn_change_absence_resolution`。
   - **開袋不再建立 `class_tasks + student_task_records` 出席記錄**；點名直接寫 `payment_bag_line_sessions`。
   - 點名 API：`POST /api/attendance/bulk`（重寫）、`POST/PATCH /api/attendance/makeup`（新建）、`PATCH /api/attendance/resolution`（新建）。
   - `class_tasks` 出席型任務（`task_type='attendance'`）的歷史資料不需刪除，但 app 不再建立新的。

8. **費用項目庫：`invoice_fee_presets` 取代 `billing_fee_presets`（2026-06-21）。**
   Migration `supabase/migrations/20260621000002_restore_invoice_fee_presets.sql` 已套用（2026-06-21）：
   - DROP `billing_fee_presets`（舊捆包範本模型，0 筆資料）；建立 `invoice_fee_presets`。
   - 欄位：`id UUID PK`、`tenant_id UUID FK tenants`、`category TEXT CHECK IN ('tuition','book','misc','discount')`、`label TEXT`、`amount NUMERIC DEFAULT 0`、`status TEXT DEFAULT 'active'`。
   - UNIQUE `(tenant_id, category, label)`；RLS policy 允許 `authenticated` 依 `profiles.tenant_id` 管理自己 tenant 的資料。
   - 前端 Step 2 費用資料庫 CRUD：`GET/POST/DELETE /api/billing/fee-items`（`lib/billing/service.ts` 中 `listBillingFeeCatalog` / `saveBillingFeeCatalogItem` / `deleteBillingFeeCatalogItem`）。
   - `zz_audit` trigger 已補掛（`EXECUTE FUNCTION audit_trigger()`，2026-06-21）。

9. **`class_tasks` schema 清理（2026-06-22）。**
   - 移除 `session_date`、`session_kind`、`week_label` 欄位。
   - 新增 `slot_index INTEGER`，與 `payment_bag_line_sessions.slot_index` 語義對應
     （`bag_id + slot_index` 唯一定位一堂課，無 FK constraint，概念 join）。
   - 新增 `class_task_templates` + `class_task_template_items` 模板表。
   - 舊 `task_type='attendance'` 歷史資料保留不刪，app 停止建立新的。
   - 刪除：`SeasonPlanSheet.tsx`、`/api/season-plan`、`AddTaskModal.tsx`。
   - 新建：`PlanSheet.tsx`（整季計畫重寫）、`/api/task-templates`。

10. **新增 `session_daily_comments` 表（2026-06-23）。**
   每個班級 × 每個出席日 一則評語（給家長的話，非每個任務）。
   - 欄位：`id UUID PK`、`tenant_id UUID FK tenants`、`class_id UUID FK classes`、`session_date DATE`、`comment_text TEXT`、`status TEXT CHECK IN ('draft','published')`、`created_at`、`updated_at`。
   - UNIQUE `(tenant_id, class_id, session_date)`，同一班同一天僅一筆。
   - 已 `ENABLE ROW LEVEL SECURITY`，tenant 隔離 policy 一條（`tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())`）。
   - **trigger 已補齊（2026-06-23 驗收時補）**：`set_session_daily_comments_updated_at`（BEFORE UPDATE → `set_updated_at()`）+ `zz_audit`（AFTER I/U/D → `audit_trigger()`），與所有業務表一致。建表 DDL 當下漏掛，驗收查 information_schema 發現後補上。
   - API：`GET/POST /api/session-comments`（POST 為 upsert on `(tenant_id,class_id,session_date)`，先查 classes 取 tenant_id 對齊）。
   - 前端：`SessionCommentModal`，從 ClassSheet 出席日行的 `MessageSquare` icon 觸發（有評語填色 / 無評語淡色）。
   - **Gemini 潤色按鈕預留（disabled）**，待後續串接。

## 已知缺口 / 殭屍欄位（不是 bug，是待補）

- **`classes.department` 已有新增班級寫入 UI**，但舊資料可能仍為 null。若 buffer 的 ENG/XIAO 分類不準，優先回填舊班級 department。
- **近期已補 UI 的欄位**：`schedule_days.note`、`students.note`、`day_entries.notes`、`day_entries.sort_order`。
- **DB 預設值欄位**（非 app 寫入，勿誤判為「有在用」）：各表 `status`（rooms/schedule_days/schedule_events… 有 DEFAULT）、`updated_at`（trigger 自動維護）。

## 對 DB 跑 DDL 的方法

`.env.local` 只有 URL + anon + service-role key，**無 DB 密碼 / 無 CLI**。
service-role key 可走 PostgREST 讀寫資料，但**不能跑 DDL**。
DDL 走 Management API：在已登入的 Supabase dashboard 分頁取 `localStorage["supabase.dashboard.auth.token"].access_token`，
`POST https://api.supabase.com/v1/projects/pmoyvpnbbitnigchvluz/database/query`，body `{"query":"<sql>"}`，成功回 201 + `[]`。
