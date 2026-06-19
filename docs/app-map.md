# 簡誼 OS — 應用地圖

> 給人類和 AI 看的頁面導覽。說明每個頁面顯示什麼、每個按鈕碰哪些 DB 表。

---

## DB 表名對照

| 英文表名 | 中文名稱 | 角色 | 類別（哪些頁面） | 用途 |
|----------|----------|------|-----------------|------|
| `tenants` | 租戶 | 系統輔助 | 全域 | 補習班識別，app 幾乎不直接碰 |
| `profiles` | 帳號 | 系統輔助 | 全域（登入） | 登入/權限根本，勿刪 |
| `classes` | 班級 | 主體 | 班級、強化、Buffer、配課表 | 每個上課群體 |
| `students` | 學生 | 主體 | 學生、班級、強化、Buffer | 全校學生名冊 |
| `class_enrollments` | 選課紀錄 | 關係 | 班級、強化、Buffer | 橋接 students ↔ classes，哪個學生在哪個班 |
| `class_tasks` | 任務 | 定義 | 班級、強化、Buffer | 班級的作業/考試/出席等任務定義 |
| `student_task_records` | 任務紀錄 | 資料 | 班級成績表、強化、Buffer | 每個學生對應每個任務的狀態與成績 |
| `rooms` | 教室 | 主體 | 配課表 | 配課表用的房間 |
| `schedule_days` | 日期 | 定義 | 配課表 | 配課表的日曆日期 |
| `schedule_events` | 課程事件 | 資料 | 配課表 | 某天某時段某教室排了哪個班 |
| `schedule_event_teachers` | 授課老師 | 關係 | 配課表 | 課程事件的授課老師段落 |
| `day_entries` | 日記事 | 資料 | 配課表 | 配課表的晚餐/待辦事項 |
| `billing_seasons` | 帳務季 | 定義 | 開袋 | Q1/Q2/Q3/Q4 的課程期間（含假日清單） |
| `default_attendance` | 預設出席 | 定義 | 開袋 | 每班每期應上幾堂、哪些日期 |
| `payment_bags` | 繳費袋 | 資料 | 開袋 | 一個班級一個期間的帳單（會印出來） |
| `payment_bag_lines` | 帳單明細 | 資料 | 開袋 | 袋子裡每個學生的學費、書費、折扣、補繳 |
| `billing_fee_presets` | 費用範本 | 定義 | 開袋 | 可重複使用的學費/書費/折扣組合 |
| `audit_log` | 變更紀錄 | 系統輔助 | DB 監看 | DB 觸發器自動寫入每筆新增/更改/刪除 |

---

## DB 欄位中文對照

<details>
<summary>classes 班級</summary>

| 欄位 | 中文 |
|------|------|
| `class_name` | 班級名稱 |
| `class_code` | 班級代碼 |
| `department` | 部門（ENG/XIAO，目前無寫入 UI）|
| `level` | 程度 |
| `class_type` | 班型（intensive/double）|
| `weekday1` | 上課星期一 |
| `weekday2` | 上課星期二（雙週班） |
| `system_sessions` | 制度課次 |
| `status` | 狀態（active/archived）|
</details>

<details>
<summary>students 學生</summary>

| 欄位 | 中文 |
|------|------|
| `chinese_name` | 中文名 |
| `english_name` | 英文名 |
| `status` | 狀態（active/inactive）|
| `school` | 就讀學校 |
| `grade` | 年級 |
| `note` | 備註（目前無表單寫入）|
| `parent_name` | 家長姓名 |
| `parent_phone` | 家長電話 |
</details>

<details>
<summary>class_tasks 任務</summary>

| 欄位 | 中文 |
|------|------|
| `task_type` | 任務類型（homework作業/quiz考試/practice練習/attendance出席/comment評論）|
| `task_name` | 任務名稱 |
| `week_label` | 週次標籤 |
| `lesson_label` | 課次標籤 |
| `threshold_value` | 過關門檻（分數）|
| `max_score` | 滿分 |
| `threshold_text` | 門檻文字說明 |
| `display_order` | 顯示順序 |
| `status` | 狀態 |
</details>

<details>
<summary>student_task_records 任務紀錄</summary>

| 欄位 | 中文 |
|------|------|
| `class_task_id` | 對應任務 |
| `student_id` | 對應學生 |
| `status` | 狀態（pending待處理/correcting批改中/completed完成/retake_ready補考/wont_do免做…）|
| `latest_result` | 最新成績 |
| `result_history` | 成績歷史（每次都記）|
| `teacher_note` | 老師備註 |
| `comment_text` | 評語內容 |
| `comment_status` | 評語狀態 |
</details>

<details>
<summary>payment_bag_lines 帳單明細</summary>

| 欄位 | 中文 |
|------|------|
| `student_order` | 學生排序 |
| `session_count` | 實際課次 |
| `rate_per_session` | 每堂單價 |
| `tuition_amount` | 學費小計 |
| `book_name` | 書名 |
| `book_fee` | 書費 |
| `misc_label` | 雜費名稱 |
| `misc_fee` | 雜費金額 |
| `discount_label` | 折扣名稱 |
| `discount_amount` | 折扣金額 |
| `carryover_amount` | 上期結轉 |
| `carryover_note` | 結轉說明 |
| `adjustment_label` | 調整項目名稱 |
| `adjustment_amount` | 調整金額 |
| `total_amount` | 總金額 |
| `issue_status` | 發單狀態（live DB 尚存在；目前 app 不寫入） |
| `paid_amount` | 已付金額（live DB 尚存在；目前 app 不寫入） |
| `intro_card_received` | 介紹卡收到（live DB 尚存在；目前 app 不寫入） |
| `handler` | 經手人（live DB 尚存在；目前 app 不寫入） |
| `payment_status` | 付款狀態（live DB 尚存在；目前 app 不寫入） |
</details>

---

## 頁面地圖

---

### 學生 `/students`

**這頁在做什麼：** 全校學生名冊，可以新增、搜尋、編輯學生資料。

**讀取資料：**
- `students` — 學生基本資料
- `class_enrollments` + `classes` — 每個學生目前在哪些班

**操作清單：**

| 按鈕 / 動作 | 呼叫 API | 寫入哪些表 |
|-------------|----------|-----------|
| 搜尋學生（輸入名字）| `GET /api/students?q=...` | — |
| 新增學生 | `POST /api/students` | `students`（新增一筆）|
| 編輯學生資料 | `PATCH /api/students` | `students`（更新姓名/學校/年級/家長資訊）|

---

### 班級 `/classes`

**這頁在做什麼：** 列出所有班級，可以新增班級、點進去看成績表。

**讀取資料：**
- `classes` — 班級列表
- `class_enrollments` — 每班人數

**操作清單：**

| 按鈕 / 動作 | 呼叫 API | 寫入哪些表 |
|-------------|----------|-----------|
| 新增班級 | `POST /api/classes` | `classes`（新增一筆）|
| 點班級名稱 | 導向 `/classes/[id]` | — |

---

### 班級成績表 `/classes/[id]`

**這頁在做什麼：** 橫軸是學生、縱軸是任務的格子表。每個格子是這位學生這個任務的狀態與成績，點格子可以更新。

**讀取資料：**
- `classes` — 班級基本資料
- `class_enrollments` + `students` — 班上學生列表
- `class_tasks` — 班上所有任務
- `student_task_records` — 每個格子的狀態/成績

**操作清單：**

| 按鈕 / 動作 | 呼叫 API | 寫入哪些表 | 備註 |
|-------------|----------|-----------|------|
| 加任務 | `POST /api/tasks` | `class_tasks`（新任務）+ `student_task_records`（為每位在班學生建紀錄）| 一次新增，紀錄立刻展開給所有人 |
| 刪任務 | `DELETE /api/tasks?task_id=...` | 先刪 `student_task_records`，再刪 `class_tasks` | |
| 點格子 → 更新狀態/成績 | `PATCH /api/task-records` | `student_task_records` | |
| 加學生（加入班級）| `POST /api/enrollments` | `class_enrollments` | |
| 移除學生 | `DELETE /api/enrollments` | `class_enrollments`（狀態改 dropped）| 紀錄保留，不刪 |
| 派發 | `POST /api/dispatch` | `student_task_records` | 補建後加入學生缺少的任務紀錄 |
| Kanban | 導向 `/classes/[id]/kanban` | — | |
| 開袋 | 導向 `/billing?classId=...` | — | |

**重要邏輯：**
- 新增任務時，系統會自動為所有在班學生建立 `student_task_records`
- 新加入的學生要手動按「派發」才會補到現有任務

---

### 強化 `/reinforcement`

**這頁在做什麼：** 30 個快速輸入格，搜尋學生 → 看到他的待處理任務 → 輸入成績/狀態送出。適合一次處理多個學生。

**讀取資料：**
- `students` — 搜尋學生
- `student_task_records` + `class_tasks` — 該學生的待處理任務

**操作清單：**

| 按鈕 / 動作 | 呼叫 API | 寫入哪些表 | 備註 |
|-------------|----------|-----------|------|
| 輸入名字搜尋 | `GET /api/reinforcement/tasks?name=...` | — | |
| 送出成績/狀態 | `PATCH /api/reinforcement/tasks` | `student_task_records` | 有狀態機邏輯：考試未達門檻自動變「補考」|

---

### Buffer `/buffer`

**這頁在做什麼：** 顯示所有待處理/批改中的任務看板，依部門（ENG/XIAO）和狀態篩選。

> ⚠️ 目前部門篩選失效：`classes.department` 欄位從未被寫入，ENG/XIAO 分類無法運作。

**讀取資料：**
- `student_task_records` + `class_tasks` + `classes`（department）

**操作清單：**

| 按鈕 / 動作 | 呼叫 API | 寫入哪些表 |
|-------------|----------|-----------|
| 篩選狀態/部門 | `GET /api/buffer?status=...` | — |
| 更新任務紀錄 | `PATCH /api/buffer` | `student_task_records` |

---

### 配課表 `/workspace`

**這頁在做什麼：** 一天的排課格子（教室 × 時段），側邊有晚餐計畫和待辦事項。

**讀取資料：**
- `rooms` — 教室列表
- `schedule_events` + `schedule_days` — 當日課程事件
- `day_entries` — 晚餐/待辦

**操作清單：**

| 按鈕 / 動作 | 呼叫 API | 寫入哪些表 |
|-------------|----------|-----------|
| 新增課程事件 | `POST /api/schedule/events` | `schedule_events` |
| 編輯事件 | `PATCH /api/schedule/events/[id]` | `schedule_events` |
| 刪除事件 | `DELETE /api/schedule/events/[id]` | `schedule_events` |
| 加晚餐/待辦 | `POST /api/day-entries` | `day_entries` |
| 編輯晚餐/待辦 | `PATCH /api/day-entries` | `day_entries` |

---

### 開袋 `/billing`

**這頁在做什麼：** 帳務管理。設定課程季、設定每班出席規則、產生學費袋（帳單），每個袋子裡有每位學生的學費明細。

**讀取資料：**
- `billing_seasons` — 課程季列表
- `classes` — 班級
- `default_attendance` — 預設課次
- `class_tasks` + `student_task_records`（task_type=attendance）— 實際出席
- `payment_bags` + `payment_bag_lines` — 帳單
- `billing_fee_presets` — 費用範本

**操作清單：**

| 按鈕 / 動作 | 呼叫 API | 寫入哪些表 |
|-------------|----------|-----------|
| 新增課程季 | `POST /api/billing {action:'create-season'}` | `billing_seasons` |
| 設定假日 | `POST /api/billing {action:'replace-holidays'}` | `billing_seasons.holiday_dates` |
| 設定班級課次 | `POST /api/billing {action:'save-class'}` | `classes` |
| 產生預設出席 | `POST /api/billing {action:'generate-defaults'}` | `default_attendance` |
| 紀錄實際出席 | `POST /api/billing {action:'record-attendance'}` | `class_tasks` / `student_task_records` |
| 記錄補課/加課 | `POST /api/billing {action:'record-extra-attendance'}` | `class_tasks`（新出席任務）|
| 開袋（產生帳單）| `POST /api/billing/bags` | `payment_bags` + `payment_bag_lines` |
| 編輯帳單明細 | `PATCH /api/billing/bags` | `payment_bag_lines`（學費/書費/折扣等）|
| 計算退費 | `POST /api/billing/attendance-refund` | `payment_bag_lines` |
| 新增費用範本 | `POST /api/billing/fee-presets` | `billing_fee_presets` |
| 記錄列印 | `POST /api/billing {action:'record-print'}` | `payment_bags.print_count` |

---

### DB 監看 `/db`

**這頁在做什麼：** 開發/管理用工具。直接看 DB 所有表的內容和即時變更記錄。

**讀取資料：**
- 所有表的筆數（`audit_log` 除外）
- 選中的表的最新 100 筆資料
- `audit_log` — 即時變更流

**操作清單：**

| 按鈕 / 動作 | 呼叫 API | 寫入哪些表 |
|-------------|----------|-----------|
| 點左側表名 | `GET /api/db/rows?table=...` | — |
| 刪除一列（垃圾桶）| `DELETE /api/db/rows?table=...&id=...` | 對應表（`profiles`/`tenants` 不可刪）|
| 隱藏欄位（眼睛）| — | —（純前端）|
| 暫停/繼續自動更新 | — | — |
| 重新整理 | `GET /api/db/snapshot` + `GET /api/db/audit` | — |

---

## 系統自動發生的事（非按鈕觸發）

| 事件 | 自動結果 |
|------|---------|
| 新增任務 | 所有在班學生自動建立 `student_task_records` |
| 任何資料新增/更改/刪除 | `audit_log` 自動記一筆（DB 觸發器）|
| 考試低於門檻 | 狀態自動改為「補考」(`retake_ready`)，而非完成 |

---

## 已知缺陷

| 功能 | 問題 |
|------|------|
| Buffer 部門篩選 | 新班級已可寫 `classes.department`，舊班級若為 null 仍需回填 |
| 授課老師 | 目前可在配課表時段指定老師；進階分段/換老師仍待細化 |
