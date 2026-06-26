# 配課表課卡配色精簡 — 施工規格

頁面：`/workspace`（配課表）
檔案：**只准碰 `components/schedule/ScheduleGrid.tsx`**（純前端、可逆）

## ⚠️ 協調（先確認再動工）
`ScheduleGrid.tsx` 與 `CreateEventModal.tsx` 同屬 `docs/schedule-modal-refine-spec.md`（Engineer 9）的範圍。
- **動工前確認 Engineer 9 對 `ScheduleGrid.tsx` 沒有未提交的改動**（避免兩人同時改同檔互撞）。
- 最好把這份工單**併給 Engineer 9 同一條線**做；若由別人做，先確保 `ScheduleGrid.tsx` 在乾淨已提交狀態。
- **禁止碰**：`CreateEventModal.tsx`、任何 `app/api/**`、SQL / DDL、schema、`lib/**`、`components/grade/**`。

## 問題
課卡同時疊兩套配色：**課程色**（`event.color`：外框 border、`border-l-4`、底色、分段虛線）＋**老師色**（`teacher.color`：每個老師分段底色 + 左色條）。兩套互不相關地搶眼 → 整張表很亂。

## 決策（老闆已拍板）
**以老師色為主**：老師分段的色塊是唯一主要填色；**課程色退為一個小色點 + 標題文字**，不再參與外框/底色/分隔線。

## 要改的（`ScheduleGrid.tsx`，多老師分支 `teachers.length > 0`，約 287–362 行）
1. **外層卡片去課程色**：
   - 移除 `borderColor: color` → 改用中性 `border-border`（className，不用 inline 課程色）。
   - 移除外層 `backgroundColor: eventFill(color)` → 改透明 / `bg-background`（反正被老師分段覆蓋）。
   - 移除/中性化 `border-l-4` 的課程色左粗邊（改為一般 `border` 或拿掉）。
   - 保留 `rounded-md`、`overflow-hidden`、`shadow-...`、hover 上浮、focus ring。
2. **老師分段維持為主色**（不動）：
   - 每段底色 `eventFill(segmentColor)`、左 1.5px 色條 `segmentColor` —— 這就是現在的主要顏色，保留。
3. **分段分隔線去課程色**：
   - `borderTop: 1px dashed {course color}` → 改中性 `border-border`（例如 `1px dashed` 取 `rgba` 中性灰 / `currentColor` 淡化），不要用課程色。
4. **課程色降為小色點**：
   - 在第一段標題 `eventTitle(event)` 前，加一顆小圓點 `inline-block size-2 rounded-full`，底色 = `event.color`。課程身分用「小點 + 標題文字」表達，不再用填色。

## 單老師/無老師分支（`teachers.length === 0`，約 365–402 行）
- 無老師 → 沒有老師色可用，**課程色當唯一填色不會撞**，可保留。
- 但為了整體一致：外框也改中性 `border-border`（與多老師分支一致），底色維持 `eventFill(course color)`（單一色、不亂）。`border-l-4` 可改為課程色細左條或保留，視覺與多老師分支協調即可。

## 不要做
- 不改配色資料來源、不改老師/課程選色 UI（那在 `CreateEventModal`，不在本工單）。
- 不動 `eventFill()` 的演算法（沿用）。

## 驗收
- 一筆 **2 段老師**的事件：卡片是**中性外框 + 內部兩條老師色帶 + 標題前一顆課程小色點**，**看不到課程色的外框/底色/虛線**。
- 整張表掃過去，主要顏色是老師色；課程色只剩小點，不再雜亂。
- `npx tsc --noEmit` 0 error、`npm run lint` 通過。
- 若能在瀏覽器驗：建一筆 2 段老師事件確認視覺，截圖後**刪除測試資料**。
- 不得 commit/push，除非老闆指示。
