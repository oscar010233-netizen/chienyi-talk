-- Audit infrastructure: audit_log table + audit_trigger() function + zz_audit triggers.
-- This migration was reconstructed from the live DB on 2026-06-21 using pg_get_functiondef
-- and information_schema queries.  It is idempotent and safe to re-run.

BEGIN;

-- ── 1. audit_log table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_log (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name      TEXT          NOT NULL,
  op              TEXT          NOT NULL,
  row_id          UUID,
  changed_columns TEXT[],
  old_data        JSONB,
  new_data        JSONB,
  actor           TEXT          NOT NULL DEFAULT CURRENT_USER,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created
  ON public.audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_table
  ON public.audit_log (table_name, created_at DESC);

-- ── 2. audit_trigger() function ───────────────────────────────────────────────
-- Reconstructed verbatim from pg_get_functiondef / pg_proc.prosrc on 2026-06-21.
-- SECURITY DEFINER so the trigger can write audit_log regardless of caller role.
CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  changed text[];
  rid uuid;
begin
  if tg_op = 'UPDATE' then
    select array_agg(e.k) into changed
    from jsonb_each(to_jsonb(NEW)) as e(k, v)
    where e.v is distinct from (to_jsonb(OLD) -> e.k)
      and e.k <> 'updated_at';
    rid := nullif(to_jsonb(NEW)->>'id','')::uuid;
    insert into public.audit_log(table_name, op, row_id, changed_columns, old_data, new_data)
    values (tg_table_name, tg_op, rid, changed, to_jsonb(OLD), to_jsonb(NEW));
    return NEW;
  elsif tg_op = 'INSERT' then
    rid := nullif(to_jsonb(NEW)->>'id','')::uuid;
    insert into public.audit_log(table_name, op, row_id, new_data)
    values (tg_table_name, tg_op, rid, to_jsonb(NEW));
    return NEW;
  else
    rid := nullif(to_jsonb(OLD)->>'id','')::uuid;
    insert into public.audit_log(table_name, op, row_id, old_data)
    values (tg_table_name, tg_op, rid, to_jsonb(OLD));
    return OLD;
  end if;
end;
$$;

-- ── 3. zz_audit triggers on all business tables ───────────────────────────────
-- Named zz_audit so they sort last and fire after all other AFTER triggers.
-- Tables confirmed from information_schema.triggers on 2026-06-21.

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'billing_seasons',
    'class_enrollments',
    'class_tasks',
    'classes',
    'day_entries',
    'invoice_fee_presets',
    'payment_bag_lines',
    'payment_bags',
    'profiles',
    'rooms',
    'schedule_days',
    'schedule_event_teachers',
    'schedule_events',
    'student_task_records',
    'students',
    'tenants'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Only create if the table exists (guards against partial DB rebuilds)
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format(
        'DROP TRIGGER IF EXISTS zz_audit ON public.%I; ' ||
        'CREATE TRIGGER zz_audit ' ||
        'AFTER INSERT OR UPDATE OR DELETE ON public.%I ' ||
        'FOR EACH ROW EXECUTE FUNCTION public.audit_trigger()',
        t, t
      );
    END IF;
  END LOOP;
END;
$$;

COMMIT;
