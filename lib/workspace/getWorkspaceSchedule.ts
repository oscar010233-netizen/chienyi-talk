import fallbackWorkspaceScheduleData from '@/lib/workspace/workspace-schedule-data.json';
import { createServiceClient } from '@/lib/supabase/server';
import type {
  WorkspaceDay,
  WorkspaceItem,
  WorkspaceScheduleData,
  WorkspaceSection,
  WorkspaceSideNote,
  WorkspaceSlot,
} from '@/lib/workspace/types';

type ScheduleWorkspaceRow = {
  id: string;
  workspace_key: string;
  title: string;
  legacy_sheet_name: string | null;
  source_workbook: string | null;
  generated_at: string | null;
  raw_source: Record<string, unknown> | null;
};

type ScheduleSectionRow = {
  id: string;
  section_key: string;
  label: string;
  start_col: number | null;
  end_col: number | null;
  tone: string | null;
  display_order: number;
};

type ScheduleDayRow = {
  id: string;
  day_key: string;
  label: string;
  english_label: string | null;
  date_serial: string | null;
  start_row: number | null;
  end_row: number | null;
  display_order: number;
};

type ScheduleSlotRow = {
  id: string;
  day_id: string;
  slot_key: string;
  source_row: number;
  hour_label: string | null;
  minute_label: string | null;
  start_time: string | null;
  display_order: number;
};

type ScheduleAssignmentRow = {
  id: string;
  day_id: string;
  slot_id: string;
  section_id: string;
  assignment_key: string;
  source_row: number;
  start_col: number | null;
  end_col: number | null;
  source_cell: string | null;
  title: string;
  subtitle: string | null;
  status_marker: string | null;
  item_kind: WorkspaceItem['kind'];
  raw_values: string[] | null;
};

type ScheduleSideNoteRow = {
  id: string;
  day_id: string;
  note_key: string;
  source_row: number;
  note_type: WorkspaceSideNote['type'];
  note_index: string | null;
  title: string;
  detail: string | null;
  amount_text: string | null;
};

const fallbackData = {
  ...(fallbackWorkspaceScheduleData as WorkspaceScheduleData),
  source: {
    ...(fallbackWorkspaceScheduleData as WorkspaceScheduleData).source,
    dataSource: 'json' as const,
  },
};

export async function getWorkspaceSchedule(): Promise<WorkspaceScheduleData> {
  try {
    const supabase = await createServiceClient();

    const { data: workspace, error: workspaceError } = await supabase
      .from('schedule_workspaces')
      .select(
        'id, workspace_key, title, legacy_sheet_name, source_workbook, generated_at, raw_source'
      )
      .eq('workspace_key', 'legacy-workspace-ui')
      .maybeSingle<ScheduleWorkspaceRow>();

    if (workspaceError || !workspace) {
      return fallbackData;
    }

    const [
      { data: sectionRows, error: sectionsError },
      { data: dayRows, error: daysError },
      { data: slotRows, error: slotsError },
      { data: assignmentRows, error: assignmentsError },
      { data: sideNoteRows, error: sideNotesError },
    ] = await Promise.all([
      supabase
        .from('schedule_sections')
        .select('id, section_key, label, start_col, end_col, tone, display_order')
        .eq('workspace_id', workspace.id)
        .order('display_order', { ascending: true })
        .returns<ScheduleSectionRow[]>(),
      supabase
        .from('schedule_days')
        .select(
          'id, day_key, label, english_label, date_serial, start_row, end_row, display_order'
        )
        .eq('workspace_id', workspace.id)
        .order('display_order', { ascending: true })
        .returns<ScheduleDayRow[]>(),
      supabase
        .from('schedule_time_slots')
        .select(
          'id, day_id, slot_key, source_row, hour_label, minute_label, start_time, display_order'
        )
        .eq('workspace_id', workspace.id)
        .order('display_order', { ascending: true })
        .returns<ScheduleSlotRow[]>(),
      supabase
        .from('schedule_assignments')
        .select(
          'id, day_id, slot_id, section_id, assignment_key, source_row, start_col, end_col, source_cell, title, subtitle, status_marker, item_kind, raw_values'
        )
        .eq('workspace_id', workspace.id)
        .order('source_row', { ascending: true })
        .returns<ScheduleAssignmentRow[]>(),
      supabase
        .from('schedule_side_notes')
        .select(
          'id, day_id, note_key, source_row, note_type, note_index, title, detail, amount_text'
        )
        .eq('workspace_id', workspace.id)
        .order('source_row', { ascending: true })
        .returns<ScheduleSideNoteRow[]>(),
    ]);

    if (
      sectionsError ||
      daysError ||
      slotsError ||
      assignmentsError ||
      sideNotesError ||
      !sectionRows ||
      !dayRows ||
      !slotRows ||
      !assignmentRows ||
      !sideNoteRows
    ) {
      return fallbackData;
    }

    const sections: WorkspaceSection[] = sectionRows.map((section) => ({
      id: section.section_key,
      label: section.label,
      startCol: section.start_col ?? 0,
      endCol: section.end_col ?? 0,
      tone: section.tone ?? 'sky',
    }));

    const sectionKeyById = new Map(
      sectionRows.map((section) => [section.id, section.section_key])
    );

    const assignmentsBySlotId = new Map<string, WorkspaceItem[]>();
    for (const assignment of assignmentRows) {
      const sectionId = sectionKeyById.get(assignment.section_id);
      if (!sectionId) {
        continue;
      }
      const item: WorkspaceItem = {
        id: assignment.assignment_key,
        sectionId,
        row: assignment.source_row,
        startCol: assignment.start_col ?? 0,
        endCol: assignment.end_col ?? 0,
        cell: assignment.source_cell ?? '',
        title: assignment.title,
        subtitle: assignment.subtitle,
        status: assignment.status_marker,
        kind: assignment.item_kind,
        raw: assignment.raw_values ?? [],
      };
      const existing = assignmentsBySlotId.get(assignment.slot_id) ?? [];
      existing.push(item);
      assignmentsBySlotId.set(assignment.slot_id, existing);
    }

    const slotsByDayId = new Map<string, WorkspaceSlot[]>();
    for (const slot of slotRows) {
      const scheduleSlot: WorkspaceSlot = {
        id: slot.slot_key,
        row: slot.source_row,
        hourLabel: slot.hour_label ?? '',
        minuteLabel: slot.minute_label ?? '',
        time: slot.start_time ?? '',
        items: assignmentsBySlotId.get(slot.id) ?? [],
      };
      const existing = slotsByDayId.get(slot.day_id) ?? [];
      existing.push(scheduleSlot);
      slotsByDayId.set(slot.day_id, existing);
    }

    const sideNotesByDayId = new Map<string, WorkspaceSideNote[]>();
    for (const note of sideNoteRows) {
      const sideNote: WorkspaceSideNote = {
        id: note.note_key,
        row: note.source_row,
        type: note.note_type,
        index: note.note_index ?? '',
        title: note.title,
        detail: note.detail,
        amount: note.amount_text,
      };
      const existing = sideNotesByDayId.get(note.day_id) ?? [];
      existing.push(sideNote);
      sideNotesByDayId.set(note.day_id, existing);
    }

    const days: WorkspaceDay[] = dayRows.map((day) => {
      const slots = slotsByDayId.get(day.id) ?? [];
      return {
        id: day.day_key,
        label: day.label,
        englishLabel: day.english_label ?? '',
        startRow: day.start_row ?? 0,
        endRow: day.end_row ?? 0,
        dateSerial: day.date_serial,
        slots,
        sideNotes: sideNotesByDayId.get(day.id) ?? [],
        itemCount: slots.reduce((sum, slot) => sum + slot.items.length, 0),
      };
    });

    return {
      source: {
        sheetName: workspace.legacy_sheet_name ?? workspace.title,
        workbook: workspace.source_workbook ?? '',
        generatedAt: workspace.generated_at ?? '',
        dataSource: 'supabase',
      },
      sections,
      days,
    };
  } catch {
    return fallbackData;
  }
}
