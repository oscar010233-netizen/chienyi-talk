# 施工單：配課表老師色彩與課卡關聯感精修

對象：Engineer 10
頁面：`/workspace`
出單：Harness 10

## 目標

1. 修正「管理老師」彈窗在桌面寬度控制項互相擠壓／重疊的問題。
2. 顏色以**老師為唯一主來源**：老師在管理頁設定顏色，配課時選老師即帶入；不要再讓使用者每段手選顏色。
3. 多老師分段仍要顯示老師色，但整體更明確讀成同一堂課。視覺採克制的 macOS 工具介面風格。

## 已確認現況

- `TeacherManagerModal.tsx` 的 `max-w-xl` 容器中放了五欄 grid（名稱、160px 排序、上下、儲存、刪除），在容器可用寬度不足時會擠壓重疊。
- 現在的 8 色寫死在 `CreateEventModal.tsx` 的 `EVENT_COLORS`：藍、紫、綠、琥珀、紅、青、橘、萊姆；這是通用 UI 色票，**不在老師表、也不是持久化老師偏好**。
- `teachers` 目前沒有 `color` 欄；`schedule_event_teachers.color` 是每一段的快照色。
- 目前多老師卡已是中性外框＋老師色帶＋課程色小點，但同堂課的框架感仍太弱。

## 範圍

可改：
- `components/schedule/TeacherManagerModal.tsx`
- `components/schedule/CreateEventModal.tsx`
- `components/schedule/ScheduleGrid.tsx`
- `app/api/teachers/route.ts`
- `app/api/teachers/[id]/route.ts`
- `app/api/schedule/events/route.ts`
- `lib/schedule/types.ts`
- 一支新的 migration、`docs/db-state.md`
- 若有必要，可新增一個共用且小型的 schedule 色票 helper。

不可改：
- 課程／班級的 `event.color` 資料語意（保留為課程識別色）。
- 既有 `schedule_event_teachers.color` 欄位與舊資料（保留為 legacy fallback）。
- 無關 API、RLS、其他領域元件。

## A. 老師管理彈窗：先修版面

- 彈窗在桌面至少能容納一筆老師資料而不重疊；建議 `md:max-w-2xl`，並有 `max-h-[92vh] overflow-y-auto`。
- 一筆老師資料改為可換行但穩定的結構：
  - 桌面：名稱輸入、排序輸入、動作群組。
  - 動作群組內放上移、下移、儲存、封存；窄螢幕自然換到下一行，不可壓住名稱或排序。
  - 排序輸入寬度約 104–116px，不要再佔 160px。
- 保留數字排序＋上下移的雙重操作，第一筆上移／最後一筆下移 disabled。
- 用 lucide icon 做上移、下移、封存與色彩選擇的輔助；保留「儲存」這個明確命令文字。

## B. 老師持久化顏色

### 資料與 migration

- 新增 migration，為 `public.teachers` 加 `color text not null`，安全 default 使用第一個共用色票（建議 `#0A84FF`）。
- migration 只可 `ADD COLUMN ... DEFAULT ... NOT NULL`，不可重建表、不可改／刪既有 `schedule_event_teachers.color`，不可動 FK、RLS、trigger。
- migration 檔先提交供驗收，**不要自行套用 Supabase production**；Harness／使用者會另行授權執行。
- API 的 GET/POST/PATCH 回傳與接受 `color`；PATCH 要接受只改 `color` 的合法請求。所有新查詢／更新維持既有 tenant 隔離慣例。
- 允許的格式只限 CSS hex `#RRGGBB`（大小寫正常化即可）；非法值回 400。

### 色票和自訂色

- 建立一組共用的 12 色 macOS 風格高辨識色票，供老師和課程選擇共用。避免只擴大同一色系，也不要使用漸層。
- 老師管理每筆顯示小色票，且提供 native `<input type="color">` 色彩井作為「自訂顏色」。這在操作和技術上都不複雜，也符合 macOS；自訂後仍以 hex 儲存。
- 色票／自訂色改動後必須按該列「儲存」才寫入，避免選色即寫入。

### 配課分段

- `TeacherOption`、schedule event GET embed、`ScheduleEventTeacher.teacher` 都補上老師 color。
- 分段列拿掉 8 顆手動選色按鈕。選老師時，將該段的 snapshot color 設成該老師 color；切換老師也同步更新。新加分段先沒有老師色，選老師後才有。
- 編輯舊事件時：若 join 到老師 color，以老師 color 顯示；若老師資料不存在／沒有色，才 fallback 到舊的 `schedule_event_teachers.color`，再 fallback 課程色。
- 顯示層 `ScheduleGrid` 同樣優先使用老師 color。這讓後續調整老師色會同步反映所有既有課表；舊 snapshot 只做相容保底。

## C. 同一堂課的關聯感：中性殼＋老師色帶

多老師課卡不得回到「課程色填滿」的雙色競爭。請改成：

- 外層是明確的單一課卡殼：`border-border` 之外再加極淡中性 inset ring／內陰影，四邊完整可見；可留一條細的中性左側 spine，禁止用課程色粗邊。
- 內部老師分段各自為淡色帶與細色條，但統一收在殼的內緣內；分段之間是中性細線。
- 課程色仍只出現在標題前 2px 小點；標題和副標保持由第一段承載，不另做浮誇標頭或巢狀卡片。
- 外框要比目前一圈單純 `border` 更可辨識，但仍保持低對比、扁平、克制，不加大圓角、漸層、裝飾圖案。
- 事件很短時不得讓標題／色點遮住老師名稱；沿用既有高度門檻並依實測微調。

## 驗收

1. 1280px 與 390px 寬度各截一張「管理老師」畫面：控制項不重疊、不被截斷，窄螢幕可垂直排。
2. 新增或編輯老師：色票選擇與自訂色各測一次，重整後顏色仍存在。
3. 新增一筆兩位老師的分段課：選老師後自動套色，表單不再出現分段色票；儲存、重整後顯示正確。
4. 編輯該老師顏色，重整配課表後既有分段也改成新色。
5. 兩段同一課：中性外殼完整包住、老師色只存在內部分段、課程色只有標題小點；短課不發生文字重疊。
6. 跑 `npx tsc --noEmit`、`npm run lint`，不得新增 warning/error。
7. 測試資料要清除或回復原色；不要 commit、push、套 production migration。

## 回報格式

- 改動檔案清單與每檔一句話。
- migration 的影響／回復方式。
- 六項驗收結果與截圖路徑。
- 沒有自行套 production migration／commit／push 的確認。
