ALTER TABLE class_tasks
  ADD COLUMN slot_index INTEGER;

ALTER TABLE class_tasks
  DROP COLUMN session_date,
  DROP COLUMN session_kind,
  DROP COLUMN week_label;

CREATE TABLE class_task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE class_task_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  template_id UUID NOT NULL REFERENCES class_task_templates(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL CHECK (task_type IN ('homework', 'practice', 'quiz', 'comment', 'progress')),
  session_position TEXT NOT NULL CHECK (session_position IN ('S1', 'S2')),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
