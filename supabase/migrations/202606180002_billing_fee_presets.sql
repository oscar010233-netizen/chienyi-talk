-- billing_fee_presets: reusable fee templates for the bag-opening workflow
CREATE TABLE IF NOT EXISTS billing_fee_presets (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL,
  class_id       UUID        REFERENCES classes(id) ON DELETE CASCADE,
  name           TEXT        NOT NULL,
  tuition_amount INTEGER     NOT NULL DEFAULT 0,
  book_rows      JSONB       NOT NULL DEFAULT '[]',
  misc_rows      JSONB       NOT NULL DEFAULT '[]',
  discount_rows  JSONB       NOT NULL DEFAULT '[]',
  is_default     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_fee_presets_tenant_idx ON billing_fee_presets(tenant_id);
CREATE INDEX IF NOT EXISTS billing_fee_presets_class_idx  ON billing_fee_presets(class_id) WHERE class_id IS NOT NULL;
