-- Merge billing_season_holidays into billing_seasons.holiday_dates
-- billing_season_holidays was always global (class_id always NULL in practice)

-- 1. Add holiday_dates array column to billing_seasons
ALTER TABLE billing_seasons
  ADD COLUMN IF NOT EXISTS holiday_dates date[] NOT NULL DEFAULT '{}';

-- 2. Migrate existing global holiday data
UPDATE billing_seasons bs
SET holiday_dates = (
  SELECT COALESCE(
    array_agg(bsh.holiday_date ORDER BY bsh.holiday_date),
    '{}'::date[]
  )
  FROM billing_season_holidays bsh
  WHERE bsh.season_id = bs.id
    AND bsh.class_id IS NULL
);

-- 3. Drop holiday_id from default_attendance (FK to billing_season_holidays)
ALTER TABLE default_attendance
  DROP COLUMN IF EXISTS holiday_id;

-- 4. Drop the now-redundant table
DROP TABLE IF EXISTS billing_season_holidays;
