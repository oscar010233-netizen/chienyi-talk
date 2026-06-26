# 施工單：teachers 程式接線 ＋ 老師管理 UI

出單：Harness 9 ｜ 對象：Codex Engineer 9 ｜ 2026-06-26
前置：`docs/teachers-table-workorder.md`（DB 那段已由 Harness 完成）

---

## 0. DB 狀態（已完成，不要再動）

Harness 剛在 Supabase 執行並驗證完畢：
- `public.teachers` 表已建好（RLS + policy + 兩個 trigger）
- 簡誼老師已種入：`id = e4e311c9-5004-4822-9e9b-5db58b165096`、`name = '簡誼老師'`
- `schedule_event_teachers.teacher_id` FK 已改指 `teachers`，兩筆資料已回填
- Migration 檔已寫：`supabase/migrations/20260626000002_create_teachers_table.sql`

**你不要碰任何 DB / SQL / migration。**

---

## 1. 動工範圍

**會碰**：
- 新增 `app/api/teachers/route.ts`（GET list + POST create）
- 新增 `app/api/teachers/[id]/route.ts`（PATCH update + DELETE 軟刪）
- 改 `app/api/schedule/events/route.ts`（embed 改指 teachers）
- 改 `app/api/schedule/events/[id]/route.ts`（同上）
- 改 `lib/schedule/types.ts`（`ScheduleEventTeacher.teacher` 型別）
- 改 `components/schedule/CreateEventModal.tsx`（下拉來源改打 /api/teachers）
- 改 `components/schedule/ScheduleGrid.tsx`（顯示欄位 display_name → name）
- 新增「老師管理」小 modal（放在 workspace 頁首，見 2.5）
- 改 `app/(app)/workspace/page.tsx`（加老師管理按鈕）
- 更新 `docs/db-state.md`（teachers 表段落）
- 更新 `lib/db/schema.ts`（teachers 欄位清單）

**禁止碰**：`components/grade/*`、`lib/grade/*`、任何 SQL/DDL、`supabase/migrations/*`。

---

## 2. 逐項說明

### 2.1 `app/api/schedule/events/route.ts` — embed 改指 teachers

第 25 行（GET query 的 select 字串）：
```diff
- teachers:schedule_event_teachers(*, teacher:profiles(id, display_name))
+ teachers:schedule_event_teachers(*, teacher:teachers(id, name))
```
`app/api/schedule/events/[id]/route.ts` 若也有同樣的 embed（GET），一起改。

### 2.2 `lib/schedule/types.ts:41`
```diff
- teacher?: { id: string; display_name: string | null } | null
+ teacher?: { id: string; name: string | null } | null
```

### 2.3 `components/schedule/ScheduleGrid.tsx:355`
```diff
- {teacher.teacher?.display_name ?? '未指定老師'}
+ {teacher.teacher?.name ?? '未指定老師'}
```

### 2.4 `components/schedule/CreateEventModal.tsx`

- interface 從 `ProfileOption { id, display_name, role }` 改成 `TeacherOption { id, name, status }`
- fetch 從 `'/api/profiles'` 改成 `'/api/teachers'`（只回 active，詳見 2.5 API）
- state 變數 `profiles` 改名 `teachers`、`setProfiles` 改名 `setTeachers`（型別一起跟）
- option 顯示：`profile.display_name` → `teacher.name`
- 停用文案（profiles.length === 0 時）：改成「尚無老師，請先到『老師管理』新增」
- 加老師管理觸發點：在分段老師選擇區旁或 modal 頂部加一顆小按鈕「管理老師」，點擊觸發 `onManageTeachers`（props 傳入）

### 2.5 新增 `app/api/teachers/route.ts` 和 `app/api/teachers/[id]/route.ts`

GET `/api/teachers`：
```ts
// 只回 active；接受 ?include=archived 回全部
.from('teachers')
.select('id, name, status, sort_order')
.eq('status', includeArchived ? undefined : 'active')   // 視 param 決定
.order('sort_order').order('name')
```
用 `createServiceClient()`（比照 /api/profiles）。

POST `/api/teachers`：body `{ name: string }`
- 取 tenant_id：`from('tenants').select('id').limit(1).single()`（比照 events route 第 58 行）
- insert teachers，回傳新 row

PATCH `/api/teachers/[id]`：body 可含 `{ name?, sort_order?, status? }`
- update，回傳更新後 row

DELETE `/api/teachers/[id]`：**軟刪**，`update status = 'archived'`，不做 hard delete（FK on delete restrict）

### 2.6 老師管理 modal（新元件）

位置：`components/schedule/TeacherManagerModal.tsx`（新建）

功能：
- 列出所有 active 老師（打 `GET /api/teachers`）
- 新增：輸入框 + 新增按鈕（POST）
- 改名：inline 點擊名字進入編輯（PATCH）
- 封存：每筆右側「封存」按鈕（軟刪）→ 從清單消失
- 操作完成後重整清單

接線：
- 在 `app/(app)/workspace/page.tsx` 加一個「老師管理」按鈕（放在現有日期導覽列附近），控制 `teacherManagerOpen` state，把它傳給 `TeacherManagerModal`
- `CreateEventModal` 的「管理老師」小按鈕 `onManageTeachers` → 讓 workspace 的 `teacherManagerOpen` 打開（透過 callback prop）
- `TeacherManagerModal` 關閉後，`CreateEventModal` 要重抓老師清單（透過 refetch 或 callback）

樣式：比照現有 workspace modal 風格（`fixed inset-0 z-50`、`mac-glass` / `bg-card`、`rounded-xl`），不要另外一套設計語言。

---

## 3. docs 更新

### 3.1 `lib/db/schema.ts`
在 `group: '配課表'` 那區，`schedule_event_teachers` 那筆旁邊加一筆 teachers：
```ts
{ name: 'teachers', group: '配課表', note: '老師名單；teacher_id FK 的對象；軟刪走 status=archived', columns: ['id', 'tenant_id', 'name', 'status', 'linked_profile_id', 'sort_order', 'created_at', 'updated_at'] },
```
`schedule_event_teachers` 那筆的 note 更新加上「teacher_id → teachers（非 profiles）」。

### 3.2 `docs/db-state.md`
在適當位置加一節（比照現有格式）：

```markdown
6. **新增 `teachers` 表（2026-06-26）。**
   - 用途：配課表「老師名單」，與登入帳號（profiles）解耦；新增/封存走管理 UI。
   - 欄位：`id UUID PK`、`tenant_id UUID FK tenants`、`name TEXT`、`status TEXT DEFAULT 'active'`（active/archived）、`linked_profile_id UUID FK profiles NULL`（選用連結登入帳號）、`sort_order INT`、`created_at`、`updated_at`。
   - RLS policy：tenant 隔離（`tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())`）。
   - Triggers：`set_teachers_updated_at`（BEFORE UPDATE）+ `zz_audit`（AFTER I/U/D）。
   - Migration：`supabase/migrations/20260626000002_create_teachers_table.sql`（已套用）。
   - **`schedule_event_teachers.teacher_id` FK 已從 `profiles` 改指 `teachers`**；既有 2 筆 segment 資料已回填。倒退備份見 `docs/teachers-table-proposal.md` §0。
```

---

## 4. 完工要求

- `npx tsc --noEmit` → 0 error；`npm run lint` → exit 0，新檔不得新增 warning。
- 端到端驗（本地 dev server）：
  1. 打開老師管理 modal → 新增一位測試老師（例：「測試老師」）→ 清單出現 ✓
  2. 開新增課程 modal → 分段老師下拉有「簡誼老師」與「測試老師」可選 ✓
  3. 選測試老師存課程 → GET 讀回老師名稱顯示正確 ✓
  4. 在老師管理 modal 封存「測試老師」→ 下拉消失 ✓
  5. 清掉測試事件（或刪除）；測試老師留著 archived 狀態沒關係（不影響現有資料）
- 不要 commit/push（沒有授權）。
- 逐項回報：哪些檔改了、端到端驗結果、有無越界。
