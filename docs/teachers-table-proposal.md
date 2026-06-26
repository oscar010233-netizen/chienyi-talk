# 老師名單機制 — 現況盤點 ＋ 提案（等老闆點頭再動 DB）

出單：Harness 9 ｜ 性質：只讀盤點，**尚未動任何 DB / 程式**
場景：配課表 `/workspace` 新增課程時「選授課老師」的下拉，目前只有 1 位老師可選。

---

## 0. 一句話結論

**現在「老師」＝「一個登入帳號」。** 想加一個老師名字，等於要開一個完整登入帳號，所以你「打不出一個老師名字就選得到」。
要能像清單一樣自由增刪老師，得**新開一張 `teachers` 名單表**——這是不可逆 DDL，故先盤點、等你決定。

---

## 1. 現況（已查證）

| 事實 | 來源 |
|---|---|
| 老師下拉資料來源 = `GET /api/profiles` → `select id, display_name, role from profiles`，**沒有依 role 過濾**，回傳全部 profiles | `app/api/profiles/route.ts` |
| `profiles` 欄位：`id, tenant_id, role, display_name, created_at`；標註「RLS 命脈，勿刪；勿直接讀寫」 | `lib/db/schema.ts:14` |
| `profiles.id` 就是 `auth.uid()`（RLS policy 用 `id = auth.uid()` 判 tenant）→ **每筆 profiles 必對應一個 auth 登入帳號** | `docs/db-state.md:49` |
| 老師時段寫在 `schedule_event_teachers.teacher_id`，其值 = `profiles.id`；GET 用 `teacher:profiles(id, display_name)` embed（代表有 FK `teacher_id → profiles.id`） | `app/api/schedule/events/route.ts:25,108` |
| modal 規則：分段未選老師會擋存（`第 N 段尚未選老師`）；`profiles.length === 0` 時停用新增 | `components/schedule/CreateEventModal.tsx` |

**目前資料量（只讀 count，今天實測）：**
- `profiles`：**1 筆** — 簡誼老師（`4167a5b6…`, role=teacher）
- `schedule_event_teachers`：**2 筆**（都指向簡誼）
- `schedule_events`：**4 筆**

→ 影響面極小，搬遷成本幾乎為零。**現在動是最便宜的時機。**

---

## 2. 為什麼不能「直接加老師」

- 不能直接 INSERT `profiles`：它是 RLS 根，`id` 綁 `auth.users`，硬塞一筆沒有對應登入帳號的 profiles 會破壞權限模型。
- 所以「加老師」目前唯一合法路徑 = 建一個真的登入帳號 → 自動長出 profiles 一筆。對「只是要在課表上掛個老師名字」這需求太重。

---

## 3. 三個方案

### 方案 A（推薦，若老師**不需要登入**）：獨立 `teachers` 名單表
新表純粹是「可被排課的老師名單」，跟登入帳號脫鉤。

```
teachers
  id              uuid  pk default gen_random_uuid()
  tenant_id       uuid  fk tenants   not null
  name            text  not null
  status          text  default 'active'         -- active / archived，停用不刪
  linked_profile_id uuid fk profiles  null        -- 選用：若這老師也有登入帳號就連起來
  sort_order      int   default 0                 -- 下拉排序
  created_at / updated_at
+ ENABLE RLS、一條 tenant 隔離 policy、一個 zz_audit 觸發器（比照現有表慣例）
```

接線改動（DDL 批准後派 Engineer 9）：
1. 建表、開 RLS / policy / audit。
2. 種一筆 `teachers`：name=「簡誼老師」、linked_profile_id = 簡誼的 profiles.id。
3. **把 `schedule_event_teachers.teacher_id` 的 FK 從 `profiles` 改指 `teachers`**，並回填那 2 筆現有資料（profiles.id → 對應 teachers.id）。← 這步是「不可逆」的核心。
4. 程式：`GET /api/schedule/events` 的 embed 改 `teacher:teachers(id, name)`；下拉改打新 `GET /api/teachers`；另做一個極簡 `POST/PATCH/DELETE /api/teachers` 給「老師管理」UI。
5. 新增一個小小的「老師管理」入口（可放 `/db` 或設定頁），讓你打字就能增刪老師。

- **可逆性**：第 3 步改 FK 指向＋回填屬不可逆 DDL；但因現況只有 2 筆要回填，真要倒退也只是再把 2 筆指回 profiles。風險低。
- **救援**：動工前先 `SELECT` 備份 `schedule_event_teachers` 那 2 筆（teacher_id 原值）寫進 docs，倒退有依據。

### 方案 B（最保守、完全可逆）：加平行欄位，不改舊 FK
- 建 `teachers` 表（同上），但**不動** `teacher_id`；改在 `schedule_event_teachers` **加一個可空欄位 `teacher_ref_id uuid fk teachers`**。
- 過渡期雙寫；舊 `teacher_id` 保留。
- 缺點：兩個老師來源並存、查詢與程式要兼顧兩欄，技術債明顯。適合「很怕倒不回去」時的折衷。

### 方案 C（不開新表，若老師**就是要登入**）：走帳號流程
- 不建 `teachers`，改做一個「建立老師帳號」admin 流程：建 auth user → 自動生 profiles（role=teacher）。
- 老師＝登入帳號，下拉沿用現況（可順手把 `/api/profiles` 加 `role=teacher` 過濾）。
- 缺點：每位老師都得有 email/登入；對「只是排課掛名」的兼課老師太重。

---

## 4. 你只需回答一個問題

> **學校的「老師」未來需不需要登入這個系統？**
> - 多數只是被排課、掛名、不登入 → **走方案 A**（推薦）。
> - 每位老師都會登入、要看自己的課/班 → **走方案 C**。
> - 想先有名單、又一步都不敢倒不回去 → **方案 B** 折衷。

選定後，我把對應的 DDL ＋ 程式接線寫成正式施工單派 Engineer 9，動 DB 前先做資料備份盤點（比照「不可逆 DDL 先盤點」規矩）。

---

## 5. 這次明確不做
- event_type 後端差異化：老闆已決定**維持純標籤**，不動。
- 在老闆於第 4 節做出選擇前，不建表、不改 FK、不動任何程式。
