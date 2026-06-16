import type { ClassRow } from '@/lib/grade/types'

export interface BillingClass extends ClassRow {
  student_count?: number
}

export interface BillingSeason {
  id: string
  tenant_id: string
  season_code: string
  year: number
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4' | string
  start_date: string
  end_date: string
  label: string | null
  status: string
}

export interface BillingHoliday {
  id: string
  tenant_id: string
  season_id: string
  class_id: string | null
  holiday_date: string
  label: string | null
}

export interface BillingStudent {
  enrollment_id: string
  student_id: string
  slot_order: number | null
  chinese_name: string | null
  english_name: string | null
  status: string | null
  school: string | null
  grade: string | null
}

export interface DefaultAttendance {
  id: string
  tenant_id: string
  season_id: string
  class_id: string
  session_index: number
  default_date: string
  original_date: string
  period_key: string
  source: string
  status: 'scheduled' | 'holiday_shifted' | 'cancelled' | 'manual' | string
  holiday_id: string | null
  note: string | null
}

export type ActualAttendanceStatus = 'attended' | 'absent' | 'cancelled' | 'makeup' | 'extra'
export type ReconciliationStatus = 'matched' | 'missed' | 'makeup' | 'extra' | 'cancelled'

export interface ActualAttendance {
  id: string
  tenant_id: string
  default_attendance_id: string | null
  season_id: string
  class_id: string
  student_id: string
  default_date: string | null
  actual_date: string
  session_index: number | null
  period_key: string | null
  actual_status: ActualAttendanceStatus | string
  reconciliation_status: ReconciliationStatus | string
  source_task_record_id: string | null
  note: string | null
}

export interface PaymentBag {
  id: string
  tenant_id: string
  season_id: string
  class_id: string
  bag_code: string
  issue_date: string
  due_date: string | null
  status: string
  tuition_note: string | null
  note: string | null
  print_count: number
  last_printed_at: string | null
  created_at: string
}

export interface PaymentBagLine {
  id: string
  tenant_id: string
  bag_id: string
  student_id: string
  student_order: number
  session_count: number
  rate_per_session: number
  tuition_amount: number
  book_name: string | null
  book_fee: number
  misc_label: string | null
  misc_fee: number
  discount_label: string | null
  discount_amount: number
  carryover_amount: number
  carryover_note: string | null
  adjustment_label: string | null
  adjustment_amount: number
  total_amount: number
  issue_status: string
  paid_amount: number | null
  intro_card_received: boolean
  handler: string | null
  payment_status: string
  note: string | null
  student?: BillingStudent
  sessions?: PaymentBagLineSession[]
  items?: PaymentBagLineItem[]
}

export interface PaymentBagLineSession {
  id?: string
  tenant_id?: string
  line_id?: string
  student_id?: string
  slot_index: number
  session_kind: 'team' | 'intensive' | string
  session_order: number
  session_date: string | null
  legacy_mmdd: string | null
  is_unscheduled: boolean
  week_key: string | null
}

export interface PaymentBagLineItem {
  id?: string
  tenant_id?: string
  line_id?: string
  item_type: 'tuition' | 'book' | 'misc' | 'discount' | 'carryover' | 'adjustment' | string
  label: string | null
  amount: number
  sort_order: number
  preset_key: string | null
}

export interface PaymentBagWithLines extends PaymentBag {
  lines: PaymentBagLine[]
}

export interface BillingState {
  classes: BillingClass[]
  seasons: BillingSeason[]
  selectedClass: BillingClass | null
  selectedSeason: BillingSeason | null
  students: BillingStudent[]
  holidays: BillingHoliday[]
  defaultAttendance: DefaultAttendance[]
  actualAttendance: ActualAttendance[]
  bags: PaymentBag[]
  activeBag: PaymentBagWithLines | null
  generatedAt: string
}

export interface OpenBagInput {
  seasonId: string
  classId: string
  issueDate: string
  dueDate?: string | null
  tuitionAmount: number
  bookName?: string | null
  bookFee?: number
  miscLabel?: string | null
  miscFee?: number
  discountLabel?: string | null
  discountAmount?: number
  note?: string | null
  selectedStudents?: OpenBagStudentInput[]
}

export interface OpenBagFeeRowInput {
  preset?: string | null
  note?: string | null
  amount?: number | null
}

export interface OpenBagAdjustmentInput {
  name?: string | null
  amount?: number | null
}

export interface OpenBagStudentInput {
  studentId: string
  teamDates?: string[]
  intensiveDates?: string[]
  intensiveUnscheduled?: number
  tuitionAmount?: number | null
  bookRows?: OpenBagFeeRowInput[]
  miscRows?: OpenBagFeeRowInput[]
  discountRows?: OpenBagFeeRowInput[]
  carryoverAmount?: number | null
  carryoverNote?: string | null
  adjustments?: OpenBagAdjustmentInput[]
}
