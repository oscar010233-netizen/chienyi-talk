# 整季計畫頁改造 Spec（交辦 Codex）

> 範圍：`/classes/[classId]/plan`（整季計畫）相關。實作前請先讀 `AGENTS.md` 與 `docs/db-state.md`；欄位以 `lib/db/schema.ts` 為準。改動後跑 `npm run lint` 與 `npm run build`。

## 背景：現況關鍵事實
- **整季計畫** = `app/(app)/classes/[classId]/plan/page.tsx`（server，組 slot）+ `components/grade/PlanSheet.tsx`（client，表格 UI + 模板管理）。
- **slot 來源**：`payment_bag_lines` → `payment_bag_line_sessions`（per-student，每生每堂一列；同 `slot_index` = 同一出席日），排除 `makeup`。
- **任務**：`class_tasks`（per-class，帶 `slot_index`、`display_order`）；派發後 fan-out 到 `student_task_records`（per-student）。
- **評語有兩套並存（刻意保留）**：
  1. `session_daily_comments`：**班級層級、每出席日一則**，給家長、可 Gemini 潤色、草稿/發布。UI 入口是 ClassSheet 上的 💬。→ 本案**改稱「公告」**。
  2. `comment` task_type：**per-student**，掛 `class_tasks`，派發後每生一筆 `comment_status`。ClassSheet 已用 `commentLamp` 渲染、`TaskUpdateDrawer` 逐生編輯。→ 本案**改為開袋時自動生成**，並從整季計畫移除手動入口。
- **顏色**：`ClassSheet.tsx` 有 `TASK_CHIP` / `TASK_SHORT`（homework=violet、practice=amber、quiz=rose、comment=teal、progress=indigo、attendance=sky）。整季計畫現用死板 `bg-muted`。
- **開袋寫入點**：`lib/billing/service.ts` 的 `openPaymentBag` → `writeOpenBagLineDetails`（走 `fn_reopen_bag` RPC，可重開／reopen）。

## 已拍板的設計決策
1. 模板獨立成 **班級獨立路由** `/classes/[classId]/templates`。
2. per-student 評語在 **開袋時** 建立。
3. 任務排序用 **上/下箭頭按鈕**。
4. 班級層級每日評語 → 改稱 **「公告」**（只改 UI 中文字串，不動 DB/API/元件名）。

## 建議實作順序
前置（抽共用樣式）→ #3 顏色 → #1 模板路由 → #5 公告改名 → #2 評語自動生成 → #4 排序。#2 風險最高（碰 billing 開袋與 DB 寫入），放後面、單獨驗。

---

## 前置：抽出共用任務樣式（#3 的基礎）
**新檔** `lib/grade/task-style.ts`：把 `ClassSheet.tsx:28-44` 的 `TASK_SHORT`、`TASK_CHIP` 搬出成單一來源並 export。統一標籤（消除 plan 用「測驗/評語」、class 用「考試/評論」的不一致）——一律以 class 版為準：

```
TASK_SHORT = { attendance:'出席', homework:'作業', practice:'練習', quiz:'考試', comment:'評論', progress:'進度' }
```

`ClassSheet.tsx` 改 import 共用模組，刪本地 const。

---

## #1 模板獨立成 `/classes/[classId]/templates`
現況：模板管理 UI 嵌在 `PlanSheet.tsx:581-695`；PlanSheet 同時負責載入模板（`loadTemplates` + `useEffect` hydrate）供每堂「從模板加入」下拉使用。

1. **新檔** `components/grade/TemplateManager.tsx`（client）：搬入 —
   - state：`templates / templatesLoading / newTemplateName / newTemplateItems / error`
   - handler：`loadTemplates`、`handleCreateTemplate`、`handleDeleteTemplate`
   - JSX：`PlanSheet.tsx:581-695` 整塊「模板管理」
   - props：`tenantId`
2. **新檔** `app/(app)/classes/[classId]/templates/page.tsx`（server）：照 `plan/page.tsx:10-21` 抓 `classes.tenant_id`，渲染 header（`ArrowLeft` 回班級 + 標題「任務模板」）+ `<TemplateManager tenantId={cls.tenant_id} />`。
3. **PlanSheet 瘦身**：刪 `581-695` 模板管理區塊與 `handleCreateTemplate / handleDeleteTemplate / newTemplate*` state。**保留** `loadTemplates` / hydrate 與每堂「從模板加入」下拉（仍要消費模板）。
4. **入口**：`ClassSheet.tsx:773-778` 工具列「整季計畫」「Kanban」旁加 `任務模板` → `/classes/${classSlug}/templates`（icon 用 `LayoutTemplate`）。plan 頁 header 可順手加切換連結。

---

## #2 評語：開袋時自動建立、per-student、整季計畫不再手動加

### A. 從整季計畫 / 模板移除 comment 入口
- `PlanSheet.tsx:11-17` `TASK_TYPE_LABEL` 移除 `comment`（→「+ 評語」按鈕自動消失）。
- `TemplateManager.tsx` 新增模板的 task_type 下拉移除 comment。
- `plan/page.tsx:52-59` 的 `class_tasks` 查詢：除 `.neq('task_type','attendance')`，再排除 comment（改 `.not('task_type','in','("attendance","comment")')`）。整季計畫只管 homework/practice/quiz/progress。

### B. 開袋時自動生成 comment task（per 出席日）
**新 helper** `ensureSessionCommentTasks(supabase, { tenantId, classId, bagId })`（放 `lib/billing/service.ts` 或 `lib/grade/`）：
1. 讀此袋 distinct `slot_index`（`payment_bag_line_sessions`，排除 `makeup`；同 plan 頁邏輯）。
2. 讀現有 `class_tasks` where `class_id / bag_id / task_type='comment'`。
3. 對**缺 comment 的 slot** 各 insert 一筆 `class_tasks`：`{ task_type:'comment', task_name:'評語', slot_index, bag_id, lesson_label:null, display_order: 高值 }`。
4. fan-out 到 active enrollments → `student_task_records`（沿用 `app/api/tasks/route.ts` POST 的 skip-existing 寫法）。

**掛鉤**：`openPaymentBag` 在 `writeOpenBagLineDetails` 之後（`service.ts:804` 附近）呼叫。務必在現有流程之後、不可破壞 `fn_reopen_bag` 的衝突偵測。

**冪等性（重要）**：開袋可重開。以 `slot_index` 為鍵 → 重開不重複建；日期變動不影響（comment task 帶 slot_index，日期來自 session）。

**晚加入學生**：現有「派發」按鈕已會補齊所有 task（含 comment）缺漏記錄，自動覆蓋，不另做。

**ClassSheet 不用改**：comment task 一出現即自動以 per-student 燈號渲染、可逐生編輯。

---

## #3 整季計畫顏色配合班級頁任務 UI
- `PlanSheet.tsx:520-522` 每堂任務型別 chip：死板 `bg-muted` → 共用 `TASK_CHIP[task.task_type]`。
- `TemplateManager.tsx` 模板項目膠囊（原 `PlanSheet.tsx:608-613` 的 `S1·作業`）也套 `TASK_CHIP`。
- 標籤一律走共用模組。

---

## #4 任務順序可調（上/下箭頭）
- **API**：`app/api/tasks/route.ts` 加批次 reorder（避免相鄰交換競態）：`PATCH { action:'reorder', class_id, bag_id, slot_index, ordered_task_ids:[...] }` → 對該 slot 任務依新序重寫 `display_order`（重用該 slot 原有 order 數值池，保持與其他 slot 單調一致）。
- **UI**：`PlanSheet.tsx:518-535` 每筆任務列加 `▲/▼`（`ChevronUp/ChevronDown`），頭尾 disable。點擊先樂觀更新 slot 內 `tasks` 順序 + `sortTasks`，再打 reorder API。
- comment 已排除，排序只作用在 homework/practice/quiz/progress。

---

## #5 班級層級每日評語 → 改稱「公告」（僅 UI 文字）
保留 DB 表 `session_daily_comments`、API `/api/session-comments`、元件 `SessionCommentModal` 不動，只改顯示字串：

| 檔案:行 | 現在 | 改成 |
|---|---|---|
| `ClassSheet.tsx:192` | `aria-label="班級評語"` | `公告` |
| `ClassSheet.tsx:617` | `aria-label="班級評語"` | `公告` |
| `SessionCommentModal.tsx:86` | `{dateTitle} 班級評語` | `{dateTitle} 公告` |
| `SessionCommentModal.tsx:94` | `評語內容` | `公告內容` |
| `SessionCommentModal.tsx:99` | placeholder `輸入給家長的評語...` | `輸入公告內容（給家長）...` |
| `SessionCommentModal.tsx:28` | `請先輸入評語內容…` | `請先輸入公告內容…` |
| `app/api/session-comments/polish/route.ts:9` | `評語內容是空的…` | `公告內容是空的…` |

命名語意：改名後「公告」＝班級每日廣播（給家長、可潤色）；「評語」＝ per-student、開袋自動生成、ClassSheet 逐生編輯。兩者並存、用途分開。

---

## 驗收清單
- [ ] 整季計畫不再出現「+ 評語」按鈕；模板新增也無 comment 選項。
- [ ] 整季計畫任務 chip 顏色與班級頁一致。
- [ ] 模板管理移到 `/classes/[classId]/templates`，班級工具列有入口；整季計畫每堂「從模板加入」仍可用。
- [ ] 開袋後，每個出席日自動出現一筆 per-student 評語，ClassSheet 可逐生編輯；重開袋不產生重複。
- [ ] 整季計畫任務可用上/下箭頭調序並持久化。
- [ ] ClassSheet 的 💬 與其 Modal 文案全部顯示「公告」。
- [ ] `npm run lint` 與 `npm run build` 通過。
