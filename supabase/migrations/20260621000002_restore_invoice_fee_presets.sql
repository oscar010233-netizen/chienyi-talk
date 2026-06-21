-- Reusable, individual fee items for Step 2 of the bag-opening workflow.
-- Each dropdown selection fills one fee row; this is not a whole-form template.
--
-- Pre-flight: verified billing_fee_presets has 0 rows on 2026-06-21 before DROP.
-- If re-running on a different DB, uncomment the guard below and inspect before proceeding.

BEGIN;

-- Safety guard: abort if billing_fee_presets contains live rows.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'billing_fee_presets') THEN
    IF (SELECT COUNT(*) FROM public.billing_fee_presets) > 0 THEN
      RAISE EXCEPTION 'billing_fee_presets has live rows — inspect and migrate data before dropping';
    END IF;
  END IF;
END;
$$;

DROP TABLE IF EXISTS public.billing_fee_presets;

CREATE TABLE IF NOT EXISTS public.invoice_fee_presets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  category    TEXT NOT NULL CHECK (category IN ('tuition', 'book', 'misc', 'discount')),
  label       TEXT NOT NULL,
  amount      NUMERIC NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, category, label)
);

DROP TRIGGER IF EXISTS set_invoice_fee_presets_updated_at ON public.invoice_fee_presets;
CREATE TRIGGER set_invoice_fee_presets_updated_at
  BEFORE UPDATE ON public.invoice_fee_presets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.invoice_fee_presets ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_fee_presets TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'invoice_fee_presets'
      AND policyname = 'tenant members can manage'
  ) THEN
    CREATE POLICY "tenant members can manage"
      ON public.invoice_fee_presets
      FOR ALL TO authenticated
      USING (tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid()))
      WITH CHECK (tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid()));
  END IF;
END;
$$;

-- zz_audit trigger is created by 20260621000003_audit_log_and_trigger.sql,
-- which owns all audit trigger definitions.

COMMIT;
