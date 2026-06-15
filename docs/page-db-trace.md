# Page To DB Trace

Date: 2026-06-15

Purpose: audit the app from the frontend user's point of view. For each page,
trace what is displayed, which DB fields power it, what each button does, and
which tables/columns are read or written.

This is the practical way to find:

- split authority: the same business fact stored in more than one place
- stale/zombie fields: columns that are not displayed, not written, or no longer used
- missing persistence: UI state that looks real but is not backed by the live DB
- unsafe write paths: actions that update derived fields instead of the source of truth

## Audit Format

For every page, use the same checklist:

| Section | What to record |
|---|---|
| Route | URL and page/component files. |
| Display data | Every visible value and its DB table/column source. |
| User actions | Every button/input/submission and the API route it calls. |
| DB reads | Tables/columns selected while rendering or loading modal state. |
| DB writes | Tables/columns inserted/updated/deleted. |
| Authority decision | Which table/column is the source of truth for each business fact. |
| Risks | duplicate authority, unused columns, missing FK, stale derived values, dead UI. |

## Route Inventory

| Route | Main files | Initial DB concern |
|---|---|---|
| `/classes` | `app/(app)/classes/page.tsx`, `components/grade/ClassList.tsx` | Clean core class list. |
| `/classes/[classId]` | `app/(app)/classes/[classId]/page.tsx`, `components/grade/ClassSheet.tsx` | Main grade matrix. |
| `/classes/[classId]/kanban` | `app/(app)/classes/[classId]/kanban/page.tsx`, `components/grade/KanbanBoard.tsx` | Same data as class sheet, different view. |
| `/students` | `app/(app)/students/page.tsx`, `components/students/StudentRoster.tsx` | Student master and enrollment summary. |
| `/billing` | `app/(app)/billing/page.tsx`, `components/billing/BillingWorkspace.tsx` | Billing/open-bag model and attendance reconciliation. |
| `/workspace` | `app/(app)/workspace/page.tsx`, `components/schedule/*`, `components/workspace/*` | Schedule/day entries. Check for old workspace schema references. |
| `/buffer` | `app/(app)/buffer/page.tsx`, `components/buffer/BufferBoard.tsx` | Reinforcement task queue over `student_task_records`. |
| `/reinforcement` | `app/(app)/reinforcement/page.tsx`, `components/reinforcement/TaskSlot.tsx` | Student task lookup/update. |
| `/speaking` | `app/(app)/speaking/page.tsx` | Mostly mock/local/Azure, not core DB. |
| `/exam-grading` | `app/(app)/exam-grading/page.tsx` | External grade API, not core DB. |

## Page: `/classes`

Files:

- `app/(app)/classes/page.tsx`
- `components/grade/ClassList.tsx`
- `components/grade/CreateClassButton.tsx`
- `components/grade/CreateClassModal.tsx`
- `lib/grade/queries.ts`
- `app/api/classes/route.ts`

### Display Data

| UI value | Source code path | DB source |
|---|---|---|
| Class card title | `ClassList` renders `c.class_name` | `classes.class_name` |
| Class type label | `ClassList` renders `c.class_type` | `classes.class_type` |
| Weekday text | `ClassList` renders `c.weekday1`, `c.weekday2` | `classes.weekday1`, `classes.weekday2` |
| Student count | `getAllClasses()` counts active enrollments | `class_enrollments.class_id`, `class_enrollments.status = 'active'` |
| Card link target | `ClassList` uses `c.id` | `classes.id` |

DB reads:

```text
classes:
  id, tenant_id, class_name, class_code, department, level,
  class_type, weekday1, weekday2, system_sessions, status

class_enrollments:
  class_id
  filtered by status = 'active'
```

Authority decisions:

- Class identity source of truth: `classes.id`
- Human-readable class code: `classes.class_code`, not a relationship key
- Roster count source of truth: active rows in `class_enrollments`, not a stored count column

### Actions

| UI action | Client file | API route | DB writes |
|---|---|---|---|
| Click class card | `ClassList` | navigation only | none |
| Click "new class" | `CreateClassButton` | opens modal | none |
| Submit new class | `CreateClassModal` | `POST /api/classes` | insert `classes` |

`POST /api/classes` reads:

```text
tenants:
  id
```

`POST /api/classes` writes:

```text
classes:
  tenant_id
  class_name
  class_code
  class_type
  weekday1
  weekday2
  department
  level
  system_sessions
  status = 'active'
```

Risks / findings:

- The UI modal currently passes `level` and `system_sessions`, but not `department`.
- `department` exists and is used later to choose task template behavior, but the new-class UI does not set it. That can make task defaults fall back to English.
- `student_count` is correctly derived from `class_enrollments`, so no duplicate count authority exists here.

## Page: `/classes/[classId]`

Files:

- `app/(app)/classes/[classId]/page.tsx`
- `components/grade/ClassSheet.tsx`
- `components/grade/EnrollStudentModal.tsx`
- `components/grade/AddTaskModal.tsx`
- `components/grade/TaskUpdateDrawer.tsx`
- `lib/grade/queries.ts`
- `app/api/enrollments/route.ts`
- `app/api/tasks/route.ts`
- `app/api/dispatch/route.ts`
- `app/api/task-records/route.ts`
- `app/api/reinforcement/tasks/route.ts`

### Display Data

Page-level DB reads from `getClassDetail(classId)`:

```text
classes:
  *
  filtered by id = classId

class_enrollments:
  id, class_id, student_id, slot_order, status
  joined student: students(id, chinese_name, english_name, status, school, grade)
  filtered by class_id = classId and status = 'active'
  ordered by slot_order

class_tasks:
  id, tenant_id, class_id, week_label, lesson_label, task_type,
  task_name, threshold_value, max_score, threshold_text, display_order
  filtered by class_id = classId
  ordered by display_order

student_task_records:
  id, tenant_id, student_id, class_task_id, status, lamp,
  latest_result, result_history, comment_text, comment_status,
  teacher_note, updated_at
  filtered by class_task_id in current class task ids
```

Visible values:

| UI value | DB source |
|---|---|
| Page title class name | `classes.class_name` |
| Class code / fallback short id | `classes.class_code` or `classes.id` |
| Student count | count of active `class_enrollments` |
| Task count | count of `class_tasks` |
| Student header names | `students.chinese_name`, `students.english_name` through `class_enrollments` |
| Task row chip/type | `class_tasks.task_type` |
| Task row name | `class_tasks.task_name` |
| Task row week/lesson | `class_tasks.week_label`, `class_tasks.lesson_label` |
| Threshold display | `class_tasks.threshold_value`, `class_tasks.max_score`, `class_tasks.threshold_text` |
| Cell lamp/status | `student_task_records.status`, `student_task_records.comment_status`, derived by frontend helpers |
| Quiz detail text | `student_task_records.result_history` or `student_task_records.latest_result` |

Authority decisions:

- Enrollment source of truth: `class_enrollments`
- Task definition source of truth: `class_tasks`
- Student result source of truth: `student_task_records`
- Lamp is currently stored in `student_task_records.lamp` but often recomputed from status in UI. This is a candidate duplicate authority.

### Action: Add Student To Class

Client flow:

1. Click add student button in `ClassSheet`.
2. `EnrollStudentModal` loads all students with `GET /api/students`.
3. User selects existing students or quick-creates a new student.
4. Submit calls `POST /api/enrollments`.

DB reads:

```text
GET /api/students:
  students:
    id, chinese_name, english_name, school, grade, status, parent_name, parent_phone

POST /api/enrollments:
  classes:
    tenant_id
  class_enrollments:
    slot_order
    id, student_id, status
```

DB writes:

```text
POST /api/students, when quick-create:
  students:
    tenant_id
    chinese_name
    english_name
    school
    grade
    status = 'active'

POST /api/enrollments:
  class_enrollments insert:
    tenant_id
    class_id
    student_id
    slot_order
    status = 'active'
    joined_at

  class_enrollments update when reactivating:
    status = 'active'
    left_at = null
```

Risk / finding:

- Adding a student to an existing class does not automatically create missing `student_task_records` for existing tasks. The user must click dispatch. That may be intentional, but the UI should make the authority clear: enrollment alone is not enough to create grade cells.

### Action: Add Task

Client flow:

1. Click add task button.
2. `AddTaskModal` builds a single task or weekly batch.
3. Submit calls `POST /api/tasks`.

DB reads:

```text
classes:
  tenant_id

class_tasks:
  display_order

class_enrollments:
  student_id
  filtered by class_id and status = 'active'
```

DB writes:

```text
class_tasks insert:
  tenant_id
  class_id
  task_type
  task_name
  week_label
  lesson_label
  threshold_value
  threshold_text
  max_score
  display_order

student_task_records insert, one per active student per created task:
  tenant_id
  class_task_id
  student_id
  status defaults to 'pending'
  lamp defaults to 'red'
```

Authority decision:

- Task creation fans out result rows immediately. This is good because the grid can rely on `student_task_records` as the actual result table.

Risk / finding:

- `threshold` from the modal is mapped to `threshold_value`; `threshold_text` and `max_score` are supported by API but not exposed in this modal.

### Action: Dispatch Missing Records

Client flow:

1. Click dispatch button in `ClassSheet`.
2. Calls `POST /api/dispatch`.

DB reads:

```text
classes:
  id, tenant_id

class_enrollments:
  student_id
  filtered by active status

class_tasks:
  id

student_task_records:
  student_id, class_task_id
  filtered by current class task ids
```

DB writes:

```text
student_task_records insert for missing pairs:
  tenant_id
  student_id
  class_task_id
```

Authority decision:

- Dispatch is a repair/fill operation for the matrix. It should not create tasks or enrollments; it only fills missing task-record pairs.

Risk / finding:

- This button exists because task records can be missing after enrollment changes. That is not necessarily wrong, but it is a workflow dependency that should be explicit.

### Action: Update One Student Task Cell

Client flow:

1. Click a cell in `ClassSheet`.
2. `TaskUpdateDrawer` opens with task, student, and current record.
3. If no record exists, it first calls `POST /api/task-records`.
4. Submit calls `PATCH /api/reinforcement/tasks`.

DB reads:

```text
POST /api/task-records:
  class_tasks:
    tenant_id

PATCH /api/reinforcement/tasks:
  student_task_records joined to:
    class_tasks
    classes
```

DB writes:

```text
POST /api/task-records, only when missing:
  student_task_records upsert:
    tenant_id
    student_id
    class_task_id
    status
    lamp
    latest_result
    result_history
    teacher_note
    comment_text
    comment_status

PATCH /api/reinforcement/tasks:
  student_task_records update:
    updated_at
    teacher_note
    comment_text
    status
    lamp
    latest_result
    result_history
```

Authority decision:

- The task status and history authority is `student_task_records`.
- Business interpretation is not stored separately; it is computed by `resolveTaskSubmission()`.

Risk / finding:

- There are two write APIs for `student_task_records`: `/api/task-records` and `/api/reinforcement/tasks`.
- `/api/task-records` accepts raw writable columns directly.
- `/api/reinforcement/tasks` applies business rules through `resolveTaskSubmission()`.
- Prefer one canonical write path for normal grading updates to avoid bypassing status/lamp/history rules.

## Cross-Page Findings So Far

| Finding | Type | Why it matters |
|---|---|---|
| `student_task_records.lamp` duplicates a value often derived from `status` | Possible duplicate authority | If a row has `status = completed` but `lamp = red`, UI/business logic may disagree. |
| New enrollment does not create records for existing tasks | Workflow dependency | User must run dispatch or cells remain missing. |
| `department` affects task behavior but create-class UI does not set it | Missing input | Classes may default to the wrong task template/rules. |
| Old workspace DB path still exists in `lib/workspace/getWorkspaceSchedule.ts` | Zombie path | It reads `schedule_workspaces`, `schedule_sections`, `schedule_time_slots`, `schedule_assignments`, `schedule_side_notes`, which are not in live DB. |
| Two APIs can write `student_task_records` | Split write path | Normal updates should go through one rule-enforcing service. |

## Suggested Page Audit Order

1. `/classes`
2. `/classes/[classId]`
3. `/classes/[classId]/kanban`
4. `/students`
5. `/billing`
6. `/workspace`
7. `/buffer`
8. `/reinforcement`

