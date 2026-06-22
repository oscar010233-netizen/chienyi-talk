# 交接：class_tasks slot_index 重構 — 收尾驗證

> 給接手的 AI（Cursor）。冷啟動可直接照做。
> **DB 已全部改完並驗證過（由 Claude Code 親手套用 live DB）。你不需要、也不要碰資料庫。** 你的任務只剩 code 與文件的最終驗證。

專案根目錄：`C:\Users\oscar\Documents\JianYiOS\webapp`
先讀 `AGENTS.md` 和 `docs/db-state.md`（條目 7、8 是這次的變更紀錄）。

## 已完工（DB 端，勿動）

live Supabase（project `pmoyvpnbbitnigchvluz`）已於 2026-06-23 套用並驗證：

- `class_tasks` 新增 `slot_index INTEGER`，已從 `payment_bag_line_sessions` 回填（零失敗）。
- `class_tasks` 已 DROP `session_date` / `session_kind` / `week_label`。
- 新建 `class_task_templates` + `class_task_template_items`，兩表皆有 RLS（各 1 條 tenant 隔離 policy）+ `zz_audit` 觸發器。
- 驗證結果：`slot_index` 存在、舊欄位 0 殘留、template 表 RLS=on、policy×2、trigger×2。
- 詳見 `docs/db-state.md` 條目 7、8。

## 已完工（code 端，由 Codex 完成，勿重做）

- `lib/grade/session-model.ts`：join 改用 `slot_index`
- `lib/grade/types.ts`、`lib/grade/queries.ts`、`lib/db/schema.ts`：欄位同步
- `app/api/tasks/route.ts`：POST 吃 `slot_index`，新增 PATCH（改名 / 改 slot lesson_label）
- `app/api/task-templates/route.ts`：模板 CRUD（tenant 隔離）
- `components/grade/PlanSheet.tsx`：新整季計畫 UI
- `components/grade/ClassSheet.tsx`：移除舊「加任務」入口
- 已刪除：`SeasonPlanSheet.tsx`、`AddTaskModal.tsx`、`app/api/season-plan/route.ts`

## 你要做的（純 code / 文件，無 DB 風險）

### 1. 確認 `lib/db/schema.ts` 與 live DB 一致
`class_tasks` 條目應：**有** `slot_index`，**沒有** `session_date` / `session_kind` / `week_label`。
若還有殘留的舊欄位定義，移除它們。同時確認 `class_task_templates` / `class_task_template_items` 有對應 schema 定義。

### 2. 全域搜尋舊欄位殘留
grep 整個 repo 是否還有任何地方引用 `session_date` / `session_kind` / `week_label` **在 class_tasks / task 脈絡下**（注意：`payment_bag_line_sessions` 仍合法擁有 `session_date` / `session_kind`，那是別張表，不要動）。重點檢查：`lib/grade/*`、`app/api/tasks/*`、`components/grade/*`。

### 3. `npm run lint` + `npm run build` 必須通過
有任何 TS / lint 錯誤就修到綠。

### 4. A3 — by-lesson 分頁驗證
在 ClassSheet 的「依課程」分頁，確認多個 `slot_index` 不同但 `lesson_label` 相同的 session 會正確聚合在同一個 lesson 標題下。若資料不足以驗證，回報「需要測試資料」即可，不要自己亂塞 DB。

## 完工標準

- `lib/db/schema.ts` 與 live DB 一致（無舊欄位殘留）
- 無 class_tasks 脈絡下的 `session_date`/`session_kind`/`week_label` 殘留引用
- `npm run lint` + `npm run build` 通過
- A3 分頁聚合正確（或回報缺測試資料）

## 回報格式

逐項回報：做了什麼、結果、有沒有卡點。不要客套話。**不要對 DB 跑任何 DDL**——若你認為 schema 還需要改，先回報，不要自行動手。
