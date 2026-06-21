-- 2026-06-21: 學費費率支援 base_sessions（基準堂數）
-- invoice_fee_presets.amount = 基準費用（base_amount）
-- base_sessions = 基準堂數，NULL 表示固定金額項目（book/misc/discount）
-- 單堂費 = round(amount / base_sessions)
-- 當季學費 = round(actual_sessions × rate_per_session / 10) × 10

ALTER TABLE invoice_fee_presets
  ADD COLUMN IF NOT EXISTS base_sessions INTEGER DEFAULT NULL;

-- 非破壞性 constraint：允許 NULL（教材費/折扣/雜費），但禁止 0 或負數
ALTER TABLE invoice_fee_presets
  DROP CONSTRAINT IF EXISTS chk_base_sessions_positive;

ALTER TABLE invoice_fee_presets
  ADD CONSTRAINT chk_base_sessions_positive
  CHECK (base_sessions IS NULL OR base_sessions > 0);
