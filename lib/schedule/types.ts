export interface Room {
  id: string
  name: string
  room_type: string | null
  display_order: number
  status: 'active' | 'inactive'
}

export interface ScheduleDay {
  id: string
  date: string
  weekday: number
  note: string | null
  status: 'active' | 'cancelled'
}

export interface ScheduleEvent {
  id: string
  schedule_day_id: string
  room_id: string
  class_id: string | null
  title: string | null
  event_type: 'class' | 'makeup' | 'other'
  start_time: string  // "HH:MM:SS" from DB
  end_time: string
  color: string | null
  note: string | null
  status: 'scheduled' | 'cancelled' | 'completed'
  room?: Room | null
  class_info?: { id: string; class_name: string; class_code: string | null } | null
  teachers?: ScheduleEventTeacher[]
}

export interface ScheduleEventTeacher {
  id: string
  schedule_event_id: string
  teacher_id: string
  start_time: string
  end_time: string
  color: string | null
  teacher?: { id: string; name: string | null; color: string | null } | null
}
