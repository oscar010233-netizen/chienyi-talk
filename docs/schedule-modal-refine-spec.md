# 配課表「新增課程」modal 精修 — 施工規格

對象：Codex Engineer 9
出單：Harness 9
頁面：`/workspace`（配課表）

---

## 0. 已由 Harness 驗證的事實（先讀，省你重查）

- **後端 DB 寫入完全正確，不要動後端。** 端到端測過：透過 `POST /api/schedule/events` 送出
  room / class / title / event_type / start / end / color / note + 老師分段（含每段
  start/end/color），全部正確存回 DB 並由 `GET` 讀回一致；`DELETE` 也乾淨清掉事件與
  `schedule_event_teachers`（0 孤兒）。**API routes、SQL、schema 一律不動。**
- `profiles` 是 RLS 命脈，`lib/db/schema.ts` 標「勿直接讀寫」，目前僅 1 筆老師
  （簡誼老師，role=teacher）。老師下拉來源就是 `profiles`。

## 1. 動工範圍（只准碰這兩個檔）

- `components/schedule/CreateEventModal.tsx`
- `components/schedule/ScheduleGrid.tsx`

**禁止碰**：`components/grade/*`、`lib/grade/*`（別人未完成的 WIP）、任何 `app/api/**`、
任何 SQL / DDL。

---

## 2. 要做的五項（純前端、可逆）

### 2.1 分段視覺統一成「同一堂課」 — `ScheduleGrid.tsx`
- 位置：`roomEvents.map(...)` 內 `if (teachers.length > 0) { ... }` 那段（約原始 277–329 行）。
- **現況問題**：外層 div 無框，內部每個老師分段各自是 `border border-l-4 rounded-md shadow`
  的 `<button>`，看起來像「兩堂獨立的課」。
- **目標**：整堂課 = **一張卡**，分段是卡內的子帶。
  - 外層容器：單一外框 `borderColor: 整堂課 color`、`rounded-md`、`overflow-hidden`、
    `shadow-[0_8px_22px_-16px_rgba(0,0,0,0.65)]`、底色 `eventFill(color)`、保留 hover 上浮。
  - 每個分段：仍依時間絕對定位（沿用現有 segmentTop / segmentHeight 計算），但
    **移除自身 border / rounded / shadow**；改為
    - 底色 `eventFill(segmentColor)`；
    - 左側色條：在分段內絕對定位一條 `absolute inset-y-0 left-0 w-1.5`，底色 = 該段 `segmentColor`；
    - 段與段之間：`index > 0` 時上緣加 `borderTop: 1px dashed {整堂課 color}` 當分隔；
    - 標題 `eventTitle(event)` 只在第一段顯示一次；其餘每段顯示「老師名 起–迄」。
  - 每個分段仍可點擊 → `onClickEvent(event)`（沿用 `stopPropagation`）。
- **驗收**：一筆 2 段老師的事件，視覺上是「一個外框、內部兩條不同顏色子帶、標題只一個」，
  不再像兩堂課。

### 2.2 分段顏色補齊 8 色 — `CreateEventModal.tsx`
- 分段色票目前是 `EVENT_COLORS.slice(0, 6)`（只有 6 色），改成完整 `EVENT_COLORS`（8 色）。
- 色票容器加 `flex-wrap`，避免 8 顆 + 刪除鈕在窄欄擠壞。

### 2.3 加分段預設不選老師 — `CreateEventModal.tsx`
- `addSegment()` 內新分段的 `teacherId: profiles[0]?.id ?? ''` 改為 `teacherId: ''`，
  讓使用者主動選，避免誤帶第一位老師。（既有的「未選老師會擋存」驗證已存在，無需改。）

### 2.4 標題 / 班級 去重複感 — `CreateEventModal.tsx`
- 新增 `changeClass(classId)`：選班級時，若目前標題為空、或仍等於「前一個所選班級的名稱」，
  就自動把標題帶成新班級名（仍可手動覆寫）。把班級 `<select>` 的 onChange 接到 `changeClass`。
- 標題欄位標示為「顯示名稱（選填）」；當已選班級時 placeholder 提示「留空則用班級名稱」。
- 目的：班級 = 資料連結、標題 = 顯示名覆寫，兩者語意分清楚。

### 2.5 時間輸入彈性 — `CreateEventModal.tsx`
- 新增一個 `TimeField` 小元件與一個共用 `<datalist id="schedule-time-options">`
  （12:00–22:00 每 15 分一個 option）。
- `TimeField` 用 `type="time"` + `step={300}` + `list="schedule-time-options"`，
  保留可打字、加上 15 分鐘快選清單。
- 用 `TimeField` 取代：主表單「開始 / 結束」兩個時間 input，以及每個分段的「開始 / 結束」兩個時間 input。
- 備註：原生 `type=time` 本來就可打字；此項主要是補上快選清單。若你認為更好的時間 UX
  （例如純文字 + 格式驗證）更合適，先在交付說明裡標記、不要擅自換掉原生行為。

---

## 3. 先擱置、等老闆點頭（**這次不要做**）

- **老師寫入機制**：因 `profiles` 不可直接寫，要讓「選得到老師」需新增獨立的 `teachers`
  名單表 → 不可逆 DDL。**先做現況/影響盤點 + 提案，等老闆同意再動 DB。** 這次不碰。
- **event_type 後端邏輯**：團課/補課/其他**有**存進 DB，但目前後端沒有任何因類型而異的邏輯，
  只影響前端顯示字樣（`eventSubtitle`）。要不要加差異化邏輯，等老闆決定。

---

## 4. 完工要求

- `npx tsc --noEmit` 必須 0 error。
- `npm run lint` 通過。
- 若能在瀏覽器驗，請建一筆 2 段老師的事件確認 2.1 視覺，截圖後刪除測試資料（勿留髒資料）。
- 交付時逐項回報：哪幾項已做、2.5 是否照原生 time + datalist、有無對 2.1 視覺的判斷建議。
- 不得 commit/push，除非老闆另外指示。
