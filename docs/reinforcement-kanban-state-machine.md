# 強化任務 / Kanban 狀態機整理

來源：

- `reference/google_sheet_2_1_live.xlsx`
- `apps-script/50_KanbanToBuffer_Core.js`
- `apps-script/51_KanbanToBuffer_EngAdapter.js`
- `apps-script/51_KanbanToBuffer_EngStatusMachine.js`
- `apps-script/52_KanbanToBuffer_XiaoAdapter.js`
- `apps-script/59_KanbanToBuffer_HwDrillStatusMachine.js`
- `apps-script/80_AppShKanban_Submit.js`

## Google Sheet UI Layout

`配課表UI` 是課表加強化看板的混合 UI。

- 左側 `B:H`：日期與時間軸。
- 中段 `J:W`：接送備忘、Public、延伸教室與教室排程。
- 右側 `Y:AS`：英文部任務看板。
- 右側 `AT:BN`：小學堂任務看板。

英文部 / 小學堂看板都採用同一種 7x4 block：

- 第 1 列：學生 header，顯示中文名、英文名、班級。
- 第 2-7 列：最多 6 筆任務。
- 每筆任務 4 欄：燈號、任務名稱、左輸入、右狀態輸入。
- 超過 6 筆時，顯示 `⚠️+N` 與 `尚有 N 筆未顯示`。

`五B5` 班級表重點：

- `A:D`：任務列資訊，包含 `週次`、`課數`、`任務類型`、`任務名稱`。
- `E:F`：舊版 `TaskID` 與門檻/滿分。新平台保留門檻，ID 改由 Supabase UUID。
- `G` 之後：每位學生 2 欄，結果/狀態與備註。

`作業` 小學堂表重點：

- `A:B`：日期/週次與任務類型。
- `C`：舊版 `SlotID`。新平台不需要顯示，改由 Supabase UUID 關聯。
- 學生每人 3 欄：學生 ID、結果/狀態、年級/備註等輔助資料。

## Data Flow

舊版流程：

1. 班級表任務派發到 `EngBuffer` / `XiaoBuffer`。
2. 老師在 `配課表UI` 將學生載入英文部或小學堂 block。
3. `Buffer.loadedTo` 記錄該任務目前出現在哪些 Kanban range。
4. 老師在左輸入/右狀態欄送出。
5. Apps Script 狀態機決定是否寫入 Buffer。
6. Buffer 更新後回寫班級表。
7. 同步刷新 `AppSh_Kanban`，手機端也可反向送出。

新版 Supabase 流程：

1. `class_tasks` 保存班級任務與 `week_label` / `lesson_label`。
2. `student_task_records` 取代 Buffer，保存每位學生的狀態、最新結果、history、老師備註。
3. 強化頁依學生跨班級查詢未完成的 `student_task_records`。
4. 強化頁送出後更新同一筆 `student_task_records`。
5. 班級表也讀同一張表，因此不用再次輸入成績。

## Status Rules

狀態值：

- `pending`：待完成
- `redo`：重做 / RE
- `missing`：缺交
- `wont_do`：免做
- `retake_ready`：可補考
- `retake_correcting`：補考訂正
- `correcting`：訂正中 / 待驗收
- `completed`：完成 / 通過

考試任務：

- 純分數：
  - 滿分：`completed`
  - 達門檻但非滿分：`correcting`
  - 未達門檻：`retake_correcting`
- 分數 + 完成：
  - 達門檻：`completed`
  - 未達門檻：`retake_ready`
- 只有完成：
  - `correcting` -> `completed`
  - `retake_correcting` -> `retake_ready`
  - 其他狀態會被擋下
- 缺交、RE、免做可以由右狀態欄直接輸入。

非考試任務：

- 不接受分數輸入。
- 分數 + 狀態：忽略分數，只處理狀態。
- 只有分數：擋下並清空分數。
- 完成：`pending` / `correcting` / `redo` -> `completed`
- 訂正：`pending` / `redo` -> `correcting`
- 英文部 homework/drill 可用 `missing`。
- 小學堂 homework/drill 不使用 `missing`。

燈號：

- `pending`：紅點
- `redo`：紅 `RE`
- `missing`：黑 `缺`
- `wont_do`：白 `免`
- `retake_ready`：黃 `補`
- `retake_correcting`：紅 `訂`
- `correcting`：考試為藍 `驗`，作業/練習為黃 `訂`
- `completed`：考試為綠 `過`，作業/練習為綠 `完`
