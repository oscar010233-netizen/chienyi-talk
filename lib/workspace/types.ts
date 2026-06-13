export type WorkspaceSection = {
  id: string;
  label: string;
  startCol: number;
  endCol: number;
  tone: string;
};

export type WorkspaceItem = {
  id: string;
  sectionId: string;
  row: number;
  startCol: number;
  endCol: number;
  cell: string;
  title: string;
  subtitle?: string | null;
  status?: string | null;
  kind: "student" | "task" | "meal" | "class" | "note";
  raw: string[];
};

export type WorkspaceSlot = {
  id: string;
  row: number;
  hourLabel: string;
  minuteLabel: string;
  time: string;
  items: WorkspaceItem[];
};

export type WorkspaceSideNote = {
  id: string;
  row: number;
  type: "meal" | "todo" | "note" | "pickup";
  index: string;
  title: string;
  detail?: string | null;
  amount?: string | null;
};

export type WorkspaceDay = {
  id: string;
  label: string;
  englishLabel: string;
  startRow: number;
  endRow: number;
  dateSerial?: string | null;
  slots: WorkspaceSlot[];
  sideNotes: WorkspaceSideNote[];
  itemCount: number;
};

export type WorkspaceScheduleData = {
  source: {
    sheetName: string;
    workbook: string;
    generatedAt: string;
    dataSource?: "supabase" | "json";
  };
  sections: WorkspaceSection[];
  days: WorkspaceDay[];
};
