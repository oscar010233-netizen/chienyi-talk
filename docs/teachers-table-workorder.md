# 施工單：老師名單表（方案 A）— `teachers` 表 ＋ 配課表接線

出單：Harness 9 ｜ 對象：Codex Engineer 9 ｜ 老闆已批准方案 A（2026-06-26）
前置盤點：`docs/teachers-table-proposal.md`（先讀）

---

## 0. 動工前救援備份（已由 Harness 抓好，倒退依據）

動 FK 前 `schedule_event_teachers` 只有 2 筆，皆指向簡誼老師（profile `4167a5b6-c6b3-4467-aeae-0b6f4b30c4bb`）：

```json
[
 {"id":"4442d1e5-0ec4-4e30-a2e3-823d0a0b8c1c","teacher_id":"4167a5b6-c6b3-4467-aeae-0b6f4b30c4bb","schedule_event_id":"f559e355-9399-493b-b46b-6d7d11c4f477","start_time":"13:48:00","end_time":"14:30:00","color":"#8b5cf6"},
 {"id":"56203596-158d-483e-968c-3311d9f21b86","teacher_id":"4167a5b6-c6b3-4467-aeae-0b6f4b30c4bb","schedule_event_id":"f559e355-9399-493b-b46b-6d7d11c4f477","start_time":"14:30:00","end_time":"15:30:00","color":"#10b981"}
]
```
tenant 全部 = `5b2f677e-8488-4f65-89fc-ebed4a5f8924`。
**倒退**：若要回滾，把這 2 筆 `teacher_id` 改回 `4167a5b6…`、FK 改回指 `profiles` 即可。

---

## 1. 動工範圍

**會碰**：
- 新 migration：`supabase/migrations/20260626000002_create_teachers_table.sql`
- DB：跑上述 DDL（Management API，見第 4 節）
- 新 API：`app/api/teachers/route.ts`（GET/POST）、`app/api/teachers/[id]/route.ts`（PATCH/DELETE）
- 改 API：`app/api/schedule/events/route.ts`（embed 改指 teachers）
- 改 type：`lib/schedule/types.ts`（`ScheduleEventTeacher.teacher`）
- 改 UI：`components/schedule/CreateEventModal.tsx`（下拉來源）、`components/schedule/ScheduleGrid.tsx`（顯示欄位）
- 新 UI：workspace 開一個「老師管理」極簡 modal（見 3.4）
- 文件：完工後更新 `docs/db-state.md`、`lib/db/schema.ts`

**禁止碰**：`profiles` 表本體（不增刪欄位、不刪 row）、`components/grade/*`、`lib/grade/*`、任何與本單無關的 API。

---

## 2. DB（DDL — 先跑這個，再改程式）

完整 SQL（請原封寫進 migration 檔，再用 Management API 套用）：

```sql
-- 20260626000002_create_teachers_table.sql
-- 方案 A：獨立 teachers 名單表，schedule_event_teachers.teacher_id 由 profiles 改指 teachers

-- 1) 建表
create table if not exists public.teachers (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  name              text not null,
  status            text not null default 'active',          -- active / archived（停用不刪）
  linked_profile_id uuid references public.profiles(id) on delete set null,
  sort_order        int  not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 2) RLS + tenant policy（比照現有業務表慣例）
alter table public.teachers enable row level security;
create policy "tenant members can manage teachers" on public.teachers
  for all to authenticated
  using      (tenant_id = (select tenant_id from public.profiles where id = auth.uid()))
  with check (tenant_id = (select tenant_id from public.profiles where id = auth.uid()));

-- 3) updated_at + zz_audit triggers（與所有業務表一致）
create trigger set_teachers_updated_at before update on public.teachers
  for each row execute function set_updated_at();
create trigger zz_audit after insert or update or delete on public.teachers
  for each row execute function audit_trigger();

-- 4) 種既有老師（簡誼），linked_profile_id 連回她的 profile
insert into public.teachers (tenant_id, name, linked_profile_id)
values ('5b2f677e-8488-4f65-89fc-ebed4a5f8924', '簡誼老師', '4167a5b6-c6b3-4467-aeae-0b6f4b30c4bb');

-- 5) 改 FK 指向（順序重要：先 DROP 舊 FK → 回填值 → ADD 新 FK）
--    注意：舊 constraint 名稱請先查實際值，別硬套：
--    select conname from pg_constraint
--      where conrelid='public.schedule_event_teachers'::regclass and contype='f';
alter table public.schedule_event_teachers
  drop constraint if exists schedule_event_teachers_teacher_id_fkey;

update public.schedule_event_teachers se
set    teacher_id = t.id
from   public.teachers t
where  t.linked_profile_id = se.teacher_id;

alter table public.schedule_event_teachers
  add constraint schedule_event_teachers_teacher_id_fkey
  foreign key (teacher_id) references public.teachers(id) on delete restrict;
```

**套用後立刻驗**（同一 Management API）：
- `select id,name,linked_profile_id from teachers;` → 應有簡誼 1 筆。
- `select id, teacher_id from schedule_event_teachers;` → 2 筆 teacher_id 應已變成新 teachers.id（不再是 `4167a5b6…`）。
- 查 `pg_constraint` 確認新 FK 指向 teachers。

---

## 3. 程式接線（DDL 成功後才做）

### 3.1 `app/api/schedule/events/route.ts:25`
embed 由 profiles 改 teachers：
```diff
- teachers:schedule_event_teachers(*, teacher:profiles(id, display_name))
+ teachers:schedule_event_teachers(*, teacher:teachers(id, name))
```

### 3.2 `lib/schedule/types.ts:41`
```diff
- teacher?: { id: string; display_name: string | null } | null
+ teacher?: { id: string; name: string | null } | null
```

### 3.3 `components/schedule/ScheduleGrid.tsx:355`
```diff
- {teacher.teacher?.display_name ?? '未指定老師'} ...
+ {teacher.teacher?.name ?? '未指定老師'} ...
```

### 3.4 新 API `app/api/teachers`
- `GET /api/teachers`：`select id,name,status,sort_order from teachers order by sort_order,name`。
  預設只回 `status='active'`；接受 `?include=archived` 才回全部。比照 `app/api/profiles/route.ts` 用 `createServiceClient()`。
- `POST /api/teachers`：body `{ name }` → insert（tenant_id 取現行 tenant，比照 events route 第 58 行 `from('tenants').select('id').limit(1).single()` 的取法）。
- `PATCH /api/teachers/[id]`：改 `name` / `sort_order` / `status`。
- `DELETE /api/teachers/[id]`：**軟刪** → `update status='archived'`，**不要** hard delete（FK 是 `on delete restrict`，且要保留歷史事件能顯示名字）。

### 3.5 `components/schedule/CreateEventModal.tsx`
- 下拉資料來源 `fetch('/api/profiles')` → `fetch('/api/teachers')`。
- 把 `ProfileOption { id, display_name, role }` 換成 `TeacherOption { id, name }`；下拉 option 顯示 `teacher.name`（原第 575 行 `profile.display_name`）。
- `profiles.length === 0` 的停用/提示文案，改成「尚無老師，請先到『老師管理』新增」。
- 變數命名連帶整理（`profiles`→`teachers` 之類），但**不要**改動表單其他已驗收邏輯。

### 3.6 「老師管理」極簡 UI
- 在 `/workspace` 頁首加一顆「老師管理」按鈕，開一個小 modal：列出 active 老師、可新增（打字＋Enter）、可改名、可封存（軟刪）。
- 走 3.4 的 API。樣式比照現有 workspace modal 風格，別另造一套設計語言。
- 關閉 modal 後，新增課程的老師下拉要能拿到最新名單（重抓 `/api/teachers`）。

---

## 4. 對 DB 跑 DDL 的方法（照 `docs/db-state.md` 第 97 行）

`.env.local` 無 DB 密碼、無 CLI。service-role key **不能跑 DDL**。
DDL 走 Management API：在已登入的 Supabase dashboard 分頁取
`localStorage["supabase.dashboard.auth.token"].access_token`，
`POST https://api.supabase.com/v1/projects/pmoyvpnbbitnigchvluz/database/query`，
body `{"query":"<sql>"}`，成功回 201 + `[]`。
（這顆 token 需老闆從瀏覽器給你；拿不到就停下來回報，別自己亂試別的管道。）

---

## 5. 完工要求
- `npx tsc --noEmit` → 0 error；`npm run lint` → exit 0（新檔不得新增 warning）。
- 端到端驗：新增一位老師 →（停用 modal 提示消失）→ 排課時下拉選得到 → 存檔後 `GET` 讀回名字正確 → 課表卡顯示新老師名。測完刪掉測試老師（軟刪即可）與測試事件，勿留髒資料。
- 更新 `docs/db-state.md`（新增 teachers 表段落：欄位、RLS、trigger、FK 改向紀錄、日期）與 `lib/db/schema.ts`（teachers 欄位、schedule_event_teachers 的 teacher_id 註記改為指 teachers）。
- 逐項回報：DDL 套用結果（含驗證查詢輸出）、改了哪些檔、是否有越界。
- commit/push 一律等老闆指示（這次沒授權就不要 push）。
```
