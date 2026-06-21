-- ============================================================
-- Attendance Redesign Migration
-- payment_bag_line_sessions becomes the single source of truth
-- for both billing schedule AND attendance results.
-- Apply via Supabase Management API (see docs/db-state.md).
-- ============================================================

-- ─── 1. Fix slot_index: drop old unique constraint, allow NULL, add partial index ───

ALTER TABLE payment_bag_line_sessions
  DROP CONSTRAINT IF EXISTS payment_bag_line_sessions_line_id_slot_index_key;

ALTER TABLE payment_bag_line_sessions
  ALTER COLUMN slot_index DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uix_line_slot
  ON payment_bag_line_sessions (line_id, slot_index)
  WHERE slot_index IS NOT NULL;

-- ─── 2. Expand session_kind to include 'makeup' ───

ALTER TABLE payment_bag_line_sessions
  DROP CONSTRAINT IF EXISTS payment_bag_line_sessions_session_kind_check;

ALTER TABLE payment_bag_line_sessions
  ADD CONSTRAINT chk_session_kind
  CHECK (session_kind IN ('team', 'intensive', 'makeup'));

-- ─── 3. Add new attendance columns ───

ALTER TABLE payment_bag_line_sessions
  ADD COLUMN IF NOT EXISTS is_billable            BOOLEAN     NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS makeup_for_session_id  UUID,
  ADD COLUMN IF NOT EXISTS attendance_status       TEXT,
  ADD COLUMN IF NOT EXISTS absence_resolution      TEXT,
  ADD COLUMN IF NOT EXISTS attendance_note         TEXT,
  ADD COLUMN IF NOT EXISTS attendance_updated_at   TIMESTAMPTZ;

-- FK: ON DELETE RESTRICT — SET NULL would violate chk_makeup_has_parent
ALTER TABLE payment_bag_line_sessions
  ADD CONSTRAINT fk_makeup_for_session
  FOREIGN KEY (makeup_for_session_id)
  REFERENCES payment_bag_line_sessions(id)
  ON DELETE RESTRICT;

-- ─── 4. CHECK constraints (three-valued-logic-safe) ───

ALTER TABLE payment_bag_line_sessions
  ADD CONSTRAINT chk_att_status
  CHECK (attendance_status IS NULL
      OR attendance_status IN ('present', 'late', 'absent', 'cancelled'));

ALTER TABLE payment_bag_line_sessions
  ADD CONSTRAINT chk_abs_resolution
  CHECK (absence_resolution IS NULL
      OR absence_resolution IN ('makeup_pending', 'makeup_done', 'refund'));

-- absent team/intensive sessions must have a resolution
ALTER TABLE payment_bag_line_sessions
  ADD CONSTRAINT chk_absent_needs_resolution
  CHECK (NOT (
    session_kind IN ('team', 'intensive')
    AND attendance_status = 'absent'
    AND absence_resolution IS NULL
  ));

-- resolution only valid when attendance_status = 'absent'
ALTER TABLE payment_bag_line_sessions
  ADD CONSTRAINT chk_resolution_only_when_absent
  CHECK (absence_resolution IS NULL OR attendance_status = 'absent');

-- makeup rows must reference a parent row
ALTER TABLE payment_bag_line_sessions
  ADD CONSTRAINT chk_makeup_has_parent
  CHECK (NOT (session_kind = 'makeup' AND makeup_for_session_id IS NULL));

-- team/intensive rows cannot have a makeup parent
ALTER TABLE payment_bag_line_sessions
  ADD CONSTRAINT chk_regular_no_parent
  CHECK (NOT (session_kind IN ('team', 'intensive') AND makeup_for_session_id IS NOT NULL));

-- makeup rows are never billable
ALTER TABLE payment_bag_line_sessions
  ADD CONSTRAINT chk_makeup_not_billable
  CHECK (NOT (session_kind = 'makeup' AND is_billable = TRUE));

-- team/intensive rows must have slot_index (makeup rows use NULL slot_index)
ALTER TABLE payment_bag_line_sessions
  ADD CONSTRAINT chk_regular_has_slot
  CHECK (NOT (session_kind IN ('team', 'intensive') AND slot_index IS NULL));

-- team/intensive rows must be billable
ALTER TABLE payment_bag_line_sessions
  ADD CONSTRAINT chk_regular_is_billable
  CHECK (NOT (session_kind IN ('team', 'intensive') AND is_billable = FALSE));

-- makeup rows must NOT have a slot_index
ALTER TABLE payment_bag_line_sessions
  ADD CONSTRAINT chk_makeup_no_slot
  CHECK (NOT (session_kind = 'makeup' AND slot_index IS NOT NULL));


-- ─── 5. RPC: fn_reopen_bag ───
-- Safe upsert of sessions; blocks if attended rows would be deleted or shifted.
-- Derives tenant_id/student_id from DB — never trusts client-provided values.
-- Detects date changes AND session_kind changes as conflicts.

CREATE OR REPLACE FUNCTION fn_reopen_bag(
  p_bag_id   UUID,
  p_sessions JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_conflict_rows  JSONB;
  v_bag_tenant_id  UUID;
  v_sess           JSONB;
  v_line_id        UUID;
  v_slot_index     INT;
  v_session_date   DATE;
  v_session_kind   TEXT;
  v_session_order  INT;
  v_student_id     UUID;
  v_is_unscheduled BOOLEAN;
  v_legacy_mmdd    TEXT;
  v_week_key       TEXT;
BEGIN
  -- Verify bag exists; derive tenant_id from DB (never from client input)
  SELECT b.tenant_id INTO v_bag_tenant_id
  FROM payment_bags b
  WHERE b.id = p_bag_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'bag % not found', p_bag_id;
  END IF;

  -- Detect attended rows that would be deleted, date-shifted, or kind-changed
  SELECT jsonb_agg(
    jsonb_build_object(
      'session_row_id',    s.id,
      'session_date',      s.session_date,
      'session_kind',      s.session_kind,
      'student_id',        s.student_id,
      'attendance_status', s.attendance_status
    )
  )
  INTO v_conflict_rows
  FROM payment_bag_line_sessions s
  JOIN payment_bag_lines l ON l.id = s.line_id
  WHERE l.bag_id = p_bag_id
    AND s.session_kind IN ('team', 'intensive')
    AND s.attendance_status IS NOT NULL
    AND (
      -- row missing from new list → would be deleted
      NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_sessions) ns
        WHERE (ns->>'line_id')::UUID = s.line_id
          AND (ns->>'slot_index')::INT = s.slot_index
      )
      OR
      -- date would change
      EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_sessions) ns
        WHERE (ns->>'line_id')::UUID = s.line_id
          AND (ns->>'slot_index')::INT = s.slot_index
          AND ns->>'session_date' IS DISTINCT FROM s.session_date::TEXT
      )
      OR
      -- session_kind would change
      EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_sessions) ns
        WHERE (ns->>'line_id')::UUID = s.line_id
          AND (ns->>'slot_index')::INT = s.slot_index
          AND ns->>'session_kind' IS DISTINCT FROM s.session_kind
      )
    );

  IF v_conflict_rows IS NOT NULL AND jsonb_array_length(v_conflict_rows) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'conflicts', v_conflict_rows);
  END IF;

  -- Delete unattended rows not present in the new list
  DELETE FROM payment_bag_line_sessions s
  USING payment_bag_lines l
  WHERE l.id = s.line_id
    AND l.bag_id = p_bag_id
    AND s.session_kind IN ('team', 'intensive')
    AND s.attendance_status IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_sessions) ns
      WHERE (ns->>'line_id')::UUID = s.line_id
        AND (ns->>'slot_index')::INT = s.slot_index
    );

  -- Upsert sessions; derive tenant_id/student_id from DB; never touch attendance columns
  FOR v_sess IN SELECT * FROM jsonb_array_elements(p_sessions) LOOP
    v_line_id        := (v_sess->>'line_id')::UUID;
    v_slot_index     := (v_sess->>'slot_index')::INT;
    v_session_date   := NULLIF(v_sess->>'session_date', '')::DATE;
    v_session_kind   := v_sess->>'session_kind';
    v_session_order  := (v_sess->>'session_order')::INT;
    v_is_unscheduled := COALESCE((v_sess->>'is_unscheduled')::BOOLEAN, false);
    v_legacy_mmdd    := v_sess->>'legacy_mmdd';
    v_week_key       := v_sess->>'week_key';

    -- Verify line belongs to this bag; derive student_id from DB
    SELECT l.student_id INTO v_student_id
    FROM payment_bag_lines l
    WHERE l.id = v_line_id AND l.bag_id = p_bag_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'line % does not belong to bag %', v_line_id, p_bag_id;
    END IF;

    INSERT INTO payment_bag_line_sessions (
      tenant_id, line_id, student_id, slot_index, session_kind,
      session_order, session_date, legacy_mmdd, is_unscheduled, week_key, is_billable
    ) VALUES (
      v_bag_tenant_id, v_line_id, v_student_id, v_slot_index, v_session_kind,
      v_session_order, v_session_date, v_legacy_mmdd, v_is_unscheduled, v_week_key, true
    )
    ON CONFLICT (line_id, slot_index) WHERE slot_index IS NOT NULL
    DO UPDATE SET
      session_kind   = EXCLUDED.session_kind,
      session_order  = EXCLUDED.session_order,
      session_date   = EXCLUDED.session_date,
      legacy_mmdd    = EXCLUDED.legacy_mmdd,
      is_unscheduled = EXCLUDED.is_unscheduled,
      week_key       = EXCLUDED.week_key,
      updated_at     = NOW();
    -- attendance_status, absence_resolution, etc. are intentionally omitted from DO UPDATE SET
  END LOOP;

  RETURN jsonb_build_object('ok', true);
END;
$$;


-- ─── 6. RPC: fn_bulk_mark_attendance ───
-- Atomically mark attendance for a batch of team/intensive session rows.
-- NULL attendance_status clears the record (also cancels pending makeups).
-- Blocks modification when a completed makeup already exists for the row.

CREATE OR REPLACE FUNCTION fn_bulk_mark_attendance(
  p_bag_id   UUID,
  p_updates  JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_upd                JSONB;
  v_session_row_id     UUID;
  v_attendance_status  TEXT;
  v_absence_resolution TEXT;
  v_existing           RECORD;
  v_updated            INT := 0;
BEGIN
  -- Verify bag exists
  IF NOT EXISTS (SELECT 1 FROM payment_bags WHERE id = p_bag_id) THEN
    RAISE EXCEPTION 'bag % not found', p_bag_id;
  END IF;

  FOR v_upd IN SELECT * FROM jsonb_array_elements(p_updates) LOOP
    v_session_row_id     := (v_upd->>'session_row_id')::UUID;
    v_attendance_status  := v_upd->>'attendance_status';   -- NULL when JSON value is null
    v_absence_resolution := v_upd->>'absence_resolution';  -- NULL when JSON value is null

    -- Frontend must never set makeup_done directly
    IF v_absence_resolution = 'makeup_done' THEN
      RAISE EXCEPTION 'cannot set absence_resolution=makeup_done via bulk mark';
    END IF;

    -- Lock the row; verify it belongs to this bag
    SELECT s.id, s.session_kind, s.attendance_status, s.absence_resolution
    INTO v_existing
    FROM payment_bag_line_sessions s
    JOIN payment_bag_lines l ON l.id = s.line_id
    WHERE s.id = v_session_row_id
      AND l.bag_id = p_bag_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'session row % not found in bag %', v_session_row_id, p_bag_id;
    END IF;

    IF v_existing.session_kind NOT IN ('team', 'intensive') THEN
      RAISE EXCEPTION 'bulk mark only applies to team/intensive sessions (got %)', v_existing.session_kind;
    END IF;

    -- Block if a completed makeup exists (cannot change original once makeup is done)
    IF EXISTS (
      SELECT 1 FROM payment_bag_line_sessions
      WHERE makeup_for_session_id = v_session_row_id
        AND attendance_status IN ('present', 'late')
    ) THEN
      RAISE EXCEPTION 'cannot change attendance: a completed makeup session exists for this row';
    END IF;

    -- NULL status → clear attendance (also cancels pending makeup children)
    IF v_attendance_status IS NULL THEN
      UPDATE payment_bag_line_sessions
      SET
        attendance_status     = 'cancelled',
        absence_resolution    = NULL,
        attendance_updated_at = NOW(),
        updated_at            = NOW()
      WHERE makeup_for_session_id = v_session_row_id
        AND (attendance_status IS NULL OR attendance_status NOT IN ('present', 'late'));

      UPDATE payment_bag_line_sessions
      SET
        attendance_status     = NULL,
        absence_resolution    = NULL,
        attendance_updated_at = NOW(),
        updated_at            = NOW()
      WHERE id = v_session_row_id;

      v_updated := v_updated + 1;
      CONTINUE;
    END IF;

    -- Changing away from absent → cancel any pending (non-completed) makeup children
    IF v_existing.attendance_status = 'absent'
       AND v_attendance_status IS DISTINCT FROM 'absent'
       AND v_existing.absence_resolution = 'makeup_pending' THEN
      UPDATE payment_bag_line_sessions
      SET
        attendance_status     = 'cancelled',
        absence_resolution    = NULL,
        attendance_updated_at = NOW(),
        updated_at            = NOW()
      WHERE makeup_for_session_id = v_session_row_id
        AND (attendance_status IS NULL OR attendance_status NOT IN ('present', 'late'));
    END IF;

    -- Write attendance
    UPDATE payment_bag_line_sessions
    SET
      attendance_status     = v_attendance_status,
      absence_resolution    = CASE
                                WHEN v_attendance_status = 'absent' THEN v_absence_resolution
                                ELSE NULL
                              END,
      attendance_updated_at = NOW(),
      updated_at            = NOW()
    WHERE id = v_session_row_id;

    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'updated', v_updated);
END;
$$;


-- ─── 7. RPC: fn_create_makeup_session ───
-- Create a makeup row linked to an absent team/intensive session.
-- Requires absence_resolution = 'makeup_pending' on the original row.
-- Returns 409-worthy exception when a pending (unattended) makeup already exists
-- to prevent silent duplicates — callers must cancel the old row first.
-- tenant_id/student_id come from the existing row (not from client).

CREATE OR REPLACE FUNCTION fn_create_makeup_session(
  p_original_row_id UUID,
  p_makeup_date     DATE,
  p_bag_id          UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_orig   RECORD;
  v_new_id UUID;
BEGIN
  -- Lock original row; tenant_id/student_id come from DB (not client)
  SELECT s.id, s.line_id, s.student_id, s.tenant_id,
         s.session_kind, s.attendance_status, s.absence_resolution
  INTO v_orig
  FROM payment_bag_line_sessions s
  JOIN payment_bag_lines l ON l.id = s.line_id
  WHERE s.id = p_original_row_id
    AND l.bag_id = p_bag_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'original session row % not found in bag %', p_original_row_id, p_bag_id;
  END IF;

  -- Must be absent + makeup_pending
  IF v_orig.attendance_status != 'absent' OR v_orig.absence_resolution != 'makeup_pending' THEN
    RAISE EXCEPTION
      'original row must have attendance_status=absent and absence_resolution=makeup_pending (got status=%, resolution=%)',
      v_orig.attendance_status, v_orig.absence_resolution;
  END IF;

  -- Block when a pending (unattended) makeup child already exists
  -- Callers must cancel or mark the old row before scheduling a new date.
  IF EXISTS (
    SELECT 1 FROM payment_bag_line_sessions
    WHERE makeup_for_session_id = p_original_row_id
      AND attendance_status IS NULL
  ) THEN
    RAISE EXCEPTION 'a pending makeup session already exists for this row; cancel it before scheduling a new one';
  END IF;

  -- slot_index = NULL → bypasses the partial unique index (makeup rows have no slot)
  INSERT INTO payment_bag_line_sessions (
    tenant_id, line_id, student_id,
    slot_index, session_kind, session_order,
    session_date, legacy_mmdd, is_unscheduled, week_key,
    is_billable, makeup_for_session_id
  ) VALUES (
    v_orig.tenant_id, v_orig.line_id, v_orig.student_id,
    NULL, 'makeup', 0,
    p_makeup_date, TO_CHAR(p_makeup_date, 'MM/DD'), false, NULL,
    false, p_original_row_id
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('ok', true, 'makeup_session_id', v_new_id);
END;
$$;


-- ─── 8. RPC: fn_mark_makeup_attendance ───
-- Mark a makeup session attendance. Accepts:
--   present / late    → marks makeup done; parent → makeup_done
--   absent            → student missed makeup; parent stays makeup_pending
--   cancelled         → session cancelled
--   NULL              → clear mark (same parent reversion as absent/cancelled)
-- When reverting from present/late to any other state, restores parent to
-- makeup_pending if no other completed makeups remain.

CREATE OR REPLACE FUNCTION fn_mark_makeup_attendance(
  p_makeup_row_id     UUID,
  p_attendance_status TEXT,   -- present, late, absent, cancelled, or NULL to clear
  p_bag_id            UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_makeup RECORD;
BEGIN
  -- NULL is allowed (clears attendance); validate non-null values
  IF p_attendance_status IS NOT NULL
     AND p_attendance_status NOT IN ('present', 'late', 'absent', 'cancelled') THEN
    RAISE EXCEPTION
      'makeup attendance_status must be present, late, absent, cancelled, or null to clear (got %)',
      p_attendance_status;
  END IF;

  -- Lock makeup row; read current status for reversion logic
  SELECT s.id, s.makeup_for_session_id, s.session_kind, s.attendance_status
  INTO v_makeup
  FROM payment_bag_line_sessions s
  JOIN payment_bag_lines l ON l.id = s.line_id
  WHERE s.id = p_makeup_row_id
    AND l.bag_id = p_bag_id
    AND s.session_kind = 'makeup'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'makeup session row % not found in bag %', p_makeup_row_id, p_bag_id;
  END IF;

  -- Write new status (NULL clears it)
  UPDATE payment_bag_line_sessions
  SET
    attendance_status     = p_attendance_status,
    attendance_updated_at = NOW(),
    updated_at            = NOW()
  WHERE id = p_makeup_row_id;

  IF p_attendance_status IN ('present', 'late') THEN
    -- Makeup completed → mark parent as makeup_done
    UPDATE payment_bag_line_sessions
    SET
      absence_resolution    = 'makeup_done',
      attendance_updated_at = NOW(),
      updated_at            = NOW()
    WHERE id = v_makeup.makeup_for_session_id
      AND absence_resolution = 'makeup_pending';

  ELSIF v_makeup.attendance_status IN ('present', 'late')
     AND (p_attendance_status IS NULL OR p_attendance_status NOT IN ('present', 'late')) THEN
    -- Was completed, now un-completed (absent / cancelled / cleared) →
    -- revert parent to makeup_pending if no other completed makeups remain
    UPDATE payment_bag_line_sessions
    SET
      absence_resolution    = 'makeup_pending',
      attendance_updated_at = NOW(),
      updated_at            = NOW()
    WHERE id = v_makeup.makeup_for_session_id
      AND absence_resolution = 'makeup_done'
      AND NOT EXISTS (
        SELECT 1 FROM payment_bag_line_sessions mk2
        WHERE mk2.makeup_for_session_id = v_makeup.makeup_for_session_id
          AND mk2.id != p_makeup_row_id
          AND mk2.attendance_status IN ('present', 'late')
      );
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;


-- ─── 9. RPC: fn_change_absence_resolution ───
-- Switch between makeup_pending ↔ refund for an absent session.
-- Blocks if a completed makeup already exists.

CREATE OR REPLACE FUNCTION fn_change_absence_resolution(
  p_session_row_id UUID,
  p_new_resolution TEXT,
  p_bag_id         UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row                    RECORD;
  v_completed_makeup_count INT;
BEGIN
  IF p_new_resolution NOT IN ('makeup_pending', 'refund') THEN
    RAISE EXCEPTION 'new_resolution must be makeup_pending or refund (got %)', p_new_resolution;
  END IF;

  -- Lock the row; verify it belongs to this bag
  SELECT s.id, s.session_kind, s.attendance_status, s.absence_resolution
  INTO v_row
  FROM payment_bag_line_sessions s
  JOIN payment_bag_lines l ON l.id = s.line_id
  WHERE s.id = p_session_row_id
    AND l.bag_id = p_bag_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session row % not found in bag %', p_session_row_id, p_bag_id;
  END IF;

  IF v_row.attendance_status != 'absent' THEN
    RAISE EXCEPTION 'can only change resolution for absent sessions (got status=%)', v_row.attendance_status;
  END IF;

  SELECT COUNT(*) INTO v_completed_makeup_count
  FROM payment_bag_line_sessions
  WHERE makeup_for_session_id = p_session_row_id
    AND attendance_status IN ('present', 'late');

  IF v_completed_makeup_count > 0 THEN
    RAISE EXCEPTION 'cannot change resolution: a completed makeup session already exists';
  END IF;

  -- Switching to refund: cancel any pending makeup children
  IF p_new_resolution = 'refund' AND v_row.absence_resolution = 'makeup_pending' THEN
    UPDATE payment_bag_line_sessions
    SET
      attendance_status     = 'cancelled',
      attendance_updated_at = NOW(),
      updated_at            = NOW()
    WHERE makeup_for_session_id = p_session_row_id
      AND (attendance_status IS NULL OR attendance_status NOT IN ('present', 'late'));
  END IF;

  UPDATE payment_bag_line_sessions
  SET
    absence_resolution    = p_new_resolution,
    attendance_updated_at = NOW(),
    updated_at            = NOW()
  WHERE id = p_session_row_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;


-- ─── 10. Permissions ───
-- These RPCs are SECURITY DEFINER and only called by the API's service client.
-- Revoke from PUBLIC/authenticated to prevent direct calls from browser clients
-- that know a UUID — an authenticated user must never bypass business rules
-- by calling SECURITY DEFINER RPCs directly.

REVOKE EXECUTE ON FUNCTION fn_reopen_bag(UUID, JSONB)              FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION fn_bulk_mark_attendance(UUID, JSONB)     FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION fn_create_makeup_session(UUID, DATE, UUID) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION fn_mark_makeup_attendance(UUID, TEXT, UUID) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION fn_change_absence_resolution(UUID, TEXT, UUID) FROM PUBLIC, authenticated;

GRANT EXECUTE ON FUNCTION fn_reopen_bag(UUID, JSONB)               TO service_role;
GRANT EXECUTE ON FUNCTION fn_bulk_mark_attendance(UUID, JSONB)      TO service_role;
GRANT EXECUTE ON FUNCTION fn_create_makeup_session(UUID, DATE, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION fn_mark_makeup_attendance(UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION fn_change_absence_resolution(UUID, TEXT, UUID) TO service_role;
