# 整季計畫「一鍵套用模板」+ S1/S2 改名 Spec（交辦 Codex）

> 範圍：`/classes/[classId]/plan`（整季計畫）與模板。實作前先讀 `AGENTS.md`、`docs/db-state.md`、`docs/plan-page-revamp.md`；欄位以 `lib/db/schema.ts` 為準。改完跑 `npm run lint` 與 `npm run build`。

## 背景（現況）
- 模板項目用 `session_position: 'S1' | 'S2'` 分兩種堂：**S1=團課（team）、S2=強化（intensive）**。對應函式 `deriveSessionPosition`（[PlanSheet.tsx:56](../components/grade/PlanSheet.tsx)）：`intensive→'S2'`，其餘 `→'S1'`。
- 目前整季計畫**只能逐堂套模板**：每一堂列各有「選擇模板」下拉 + 「從模板加入」按鈕（`handleApplyTemplate(slot)`）。**沒有整季批次套用**。批次動作只有「設為同一課」（改課標，非任務）。
- 既有逐堂套用流程：`handleApplyTemplate` 用 `deriveSessionPosition` 過濾模板項目 → `createTasks(slot, items)` → `POST /api/tasks`（建任務並 fan-out 到 active enrollments）。
- 整季計畫的任務查詢已排除 `attendance` 與 `comment`（評語自動生成、不在此管）。

## 兩項需求
A. **S1/S2 顯示改名**（純文字，零風險）。
B. **一鍵套用模板到整季**（新功能，補上缺的前端能力）。

## 已拍板決策
- 套用範圍三種：**整季 / 全團課 / 全強化**。
- 衝突處理：**只在「目標堂中有既有任務」時才詢問**；全空則直接套、不打擾。詢問選項為 **覆蓋 / 跳過 / 取消**（**不做「附加」**）。
- 逐堂「從模板加入」**保留不動**（個別微調用）。

---

## A. S1/S2 顯示改名為「團課 / 強化」
- 只改**顯示字串**，**不動** `session_position` 的值（仍是 `'S1' | 'S2'`）、不動 DB、不動 API。
- 建議在共用樣式檔加一個對照，例如 `lib/grade/task-style.ts` 內 export：
  ```ts
  export const SESSION_POSITION_LABEL = { S1: '團課', S2: '強化' } as const
  ```
- 套用到：
  - `TemplateManager.tsx`：新增模板時的 S1/S2 下拉選項、以及模板項目膠囊（原顯示 `S1 · 作業`）→ 顯示「團課 · 作業」「強化 · 練習」。
  - `PlanSheet.tsx`：任何顯示 `S1/S2` 的地方（如每堂的 `團課/強化 · S1` 標註，可直接移除冗餘的 S1/S2 或改用中文）。
- 驗收：UI 上找不到「S1 / S2」字樣，全部顯示團課/強化；模板存檔後 `session_position` 值仍為 S1/S2（DB 不變）。

---

## B. 一鍵套用模板到整季

### B-1 入口（UI）
在整季計畫頂部工具列（現有「設為同一課 / 清除勾選」那排，約 [PlanSheet.tsx:453-470](../components/grade/PlanSheet.tsx)）新增一組控制項：
- 一個**模板下拉**（沿用已載入的 `templates` state，選一次）。
- 三顆按鈕：**`套用整季`**、**`套用全團課`**、**`套用全強化`**（對應 scope = `season` / `team` / `intensive`）。
- 模板未選時三顆 disable。

### B-2 目標堂與套用內容
- scope → 目標堂次（用 `slots` state）：
  - `season`：所有 slot。
  - `team`：`session_kind==='team'` 的 slot。
  - `intensive`：`session_kind==='intensive'` 的 slot。
- 每個目標堂要建立的任務 = 該模板中 `session_position` 符合該堂位置（團課→S1、強化→S2）的項目；task_name 沿用 `taskTypeName`（與逐堂套用一致）。
- 模板對某位置**沒有任何項目**時，該位置的堂直接略過（不建空任務）。

### B-3 衝突偵測與詢問（client 端先判斷，不需 dry-run API）
PlanSheet 的 `slots` state 已含每堂 `tasks`，可在前端直接判斷，免額外往返：
1. 算出目標堂集合。
2. 找出其中**已有任務的堂**（該堂 `tasks` 過濾掉 comment/attendance 後仍非空）。
3. **沒有任何衝突堂** → 直接呼叫 API（`conflict_mode` 不影響，傳 `'skip'`），套用後更新畫面。
4. **有衝突堂** → 彈出對話框：
   - 文案：「有 N 堂已有任務。」
   - **覆蓋**：⚠️ 警告文字需明講「會刪除這些堂的現有任務，連同學生在這些任務上的記錄」。送 `conflict_mode='overwrite'`。
   - **跳過**：只對空堂套用。送 `conflict_mode='skip'`。
   - **取消**：不動作。

### B-4 新 API：`POST /api/tasks/apply-template`
- Body：`{ class_id, bag_id, template_id, scope: 'season'|'team'|'intensive', conflict_mode: 'overwrite'|'skip', lesson_labels: { [slot_index]: string | null } }`
- **課標一致性（重要）**：空堂的課標只在建任務時才落地（[PlanSheet.tsx](../components/grade/PlanSheet.tsx) `applyLessonLabel` 對 `tasks.length===0` 不寫 DB）。逐堂 `createTasks` 已會帶 `lesson_label`；批次也必須一致。前端從現有 `lessonDrafts` 組 `lesson_labels` map 一起送，server 建任務時每個 slot 的 `lesson_label` 取 map 中該 slot 的值（缺則 fallback 該堂 DB 既有值 / null）。覆蓋模式重建任務時同樣套用，確保覆蓋後課標不掉。**不要用「套用後再 PATCH 寫回」的事後補丁。**
- 行為（server，沿用既有寫法）：
  1. 載入 class（tenant 校驗）、template + items。
  2. 由 `payment_bag_line_sessions`（該 bag、排除 makeup、slot_index 非空）取目標 slot 與其 `session_kind`，依 scope 過濾。
  3. 查各目標 slot 既有 `class_tasks`（該 class/bag、`task_type` 不在 `('attendance','comment')`）。
  4. `conflict_mode='skip'`：只對**沒有上述任務**的目標 slot 套用。
  5. `conflict_mode='overwrite'`：對**有任務**的目標 slot，**先刪**這些 `class_tasks` 及其 `student_task_records`（沿用 `DELETE /api/tasks` 的「先刪 records 再刪 task」順序），再套用；空 slot 同 skip 直接套。
  6. 套用 = 對每個要處理的 slot，建立符合該 slot 位置的模板任務（`display_order` 取該 class+bag 現有最大值後遞增），並 fan-out 到 active enrollments 的 `student_task_records`（skip-existing）。
  7. **comment / attendance 任務一律不碰。**
- 回傳：受影響 slot 的最新任務清單，例如 `{ slots: [{ slot_index, tasks: [...] }] }`，讓前端用既有 `updateSlot` + `sortTasks` 取代該堂 `tasks`。

### B-5 前端套用後更新
- 用 API 回傳的 `slots` 逐一 `updateSlot(slot_index, ...)` 替換 `tasks` 並 `sortTasks`，沿用現有 `setStatus/clearStatus/error` 提示模式。

---

## 邊界與不可破壞
- 不得影響評語自動生成（comment）與點名（attendance）。
- 逐堂「從模板加入」維持原行為。
- `session_position` 底層值、模板 DB schema 不變。
- 覆蓋模式刪任務會連帶刪學生記錄——務必在 UI 明確警告。

## 驗收清單
- [ ] 模板與整季計畫 UI 全部顯示「團課/強化」，無「S1/S2」字樣；存模板後 DB 值仍為 S1/S2。
- [ ] 工具列有模板下拉 + 套用整季/全團課/全強化三鍵。
- [ ] 目標堂全空時，一鍵套用無提示直接完成，任務正確落在團課=S1、強化=S2。
- [ ] 目標堂有既有任務時，跳出覆蓋/跳過/取消；跳過只填空堂；覆蓋會清掉舊任務+記錄再套，且有明確警告。
- [ ] comment/attendance 不受影響；逐堂套用仍可用。
- [ ] `npm run lint`、`npm run build` 通過。
