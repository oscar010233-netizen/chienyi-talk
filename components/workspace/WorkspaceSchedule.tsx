'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Check,
  Clock3,
  Database,
  Eye,
  EyeOff,
  ListChecks,
  MapPin,
  Utensils,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
  WorkspaceDay,
  WorkspaceItem,
  WorkspaceScheduleData,
  WorkspaceSection,
  WorkspaceSideNote,
} from '@/lib/workspace/types';

const VIEW_DENSITIES = {
  compact: {
    label: '緊湊',
    slotHeight: 44,
    timeWidth: 84,
    resourceWidth: 176,
  },
  standard: {
    label: '標準',
    slotHeight: 56,
    timeWidth: 92,
    resourceWidth: 220,
  },
};

type ViewDensity = keyof typeof VIEW_DENSITIES;

const toneClasses: Record<string, string> = {
  amber: 'border-amber-200 bg-amber-50 text-amber-950',
  lime: 'border-lime-200 bg-lime-50 text-lime-950',
  sky: 'border-sky-200 bg-sky-50 text-sky-950',
  rose: 'border-rose-200 bg-rose-50 text-rose-950',
  violet: 'border-violet-200 bg-violet-50 text-violet-950',
  cyan: 'border-cyan-200 bg-cyan-50 text-cyan-950',
  orange: 'border-orange-200 bg-orange-50 text-orange-950',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-950',
};

const headerToneClasses: Record<string, string> = {
  amber: 'bg-amber-100 text-amber-950',
  lime: 'bg-lime-100 text-lime-950',
  sky: 'bg-sky-100 text-sky-950',
  rose: 'bg-rose-100 text-rose-950',
  violet: 'bg-violet-100 text-violet-950',
  cyan: 'bg-cyan-100 text-cyan-950',
  orange: 'bg-orange-100 text-orange-950',
  emerald: 'bg-emerald-100 text-emerald-950',
};

const kindLabels: Record<WorkspaceItem['kind'], string> = {
  student: '學生',
  task: '任務',
  meal: '訂餐',
  class: '課程',
  note: '備忘',
};

const sideNoteIcon = {
  meal: Utensils,
  pickup: MapPin,
  todo: ListChecks,
  note: Check,
};

type WorkspaceScheduleProps = {
  data: WorkspaceScheduleData;
};

export function WorkspaceSchedule({ data }: WorkspaceScheduleProps) {
  const [selectedDayId, setSelectedDayId] = useState(() => {
    const todayKey = getDayKey(new Date());
    return data.days.some((day) => day.id === todayKey)
      ? todayKey
      : data.days[0]?.id ?? '';
  });
  const [visibleSectionIds, setVisibleSectionIds] = useState(
    () => new Set(data.sections.map((section) => section.id))
  );
  const [density, setDensity] = useState<ViewDensity>('standard');

  const selectedDay = useMemo(
    () => data.days.find((day) => day.id === selectedDayId) ?? data.days[0],
    [data.days, selectedDayId]
  );

  const visibleSections = useMemo(
    () => data.sections.filter((section) => visibleSectionIds.has(section.id)),
    [data.sections, visibleSectionIds]
  );

  const totalSlots = data.days.reduce((sum, day) => sum + day.slots.length, 0);
  const totalItems = data.days.reduce((sum, day) => sum + day.itemCount, 0);

  function toggleSection(sectionId: string) {
    setVisibleSectionIds((current) => {
      const next = new Set(current);
      if (next.has(sectionId) && next.size > 1) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }

  if (!selectedDay) {
    return null;
  }

  return (
    <div className="min-h-full bg-[#f7f8fa]">
      <div className="border-b border-border bg-white px-4 py-4 md:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-foreground">配課日曆</h1>
              <Badge variant="outline" className="rounded-md">
                {data.source.sheetName}
              </Badge>
              <Badge className="rounded-md bg-emerald-600 text-white">
                {totalItems} 筆排程
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <CalendarDays size={14} />
                {data.days.length} 天
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin size={14} />
                {data.sections.length} 個地點
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock3 size={14} />
                {totalSlots} 個時段
              </span>
              <span className="inline-flex items-center gap-1">
                <Database size={14} />
                {data.source.dataSource === 'supabase'
                  ? 'Supabase 資料'
                  : 'JSON 備援資料'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {data.days.map((day) => (
              <Button
                key={day.id}
                type="button"
                variant={day.id === selectedDay.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedDayId(day.id)}
                className="min-w-16"
              >
                {day.label}
                <span className="text-[10px] opacity-75">{day.englishLabel}</span>
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="border-b border-border bg-white px-4 py-3 md:px-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {data.sections.map((section) => {
              const isVisible = visibleSectionIds.has(section.id);
              const Icon = isVisible ? Eye : EyeOff;
              return (
                <Button
                  key={section.id}
                  type="button"
                  variant={isVisible ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => toggleSection(section.id)}
                  className={cn(
                    'h-8 rounded-md border',
                    isVisible && headerToneClasses[section.tone]
                  )}
                >
                  <Icon size={14} />
                  {section.label}
                </Button>
              );
            })}
          </div>

          <div className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-[#f7f8fa] p-1">
            {(Object.keys(VIEW_DENSITIES) as ViewDensity[]).map((key) => (
              <Button
                key={key}
                type="button"
                variant={density === key ? 'default' : 'ghost'}
                size="xs"
                onClick={() => setDensity(key)}
              >
                {VIEW_DENSITIES[key].label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[280px_minmax(0,1fr)]">
        <DaySidebar day={selectedDay} />
        <ScheduleGrid
          day={selectedDay}
          sections={visibleSections}
          density={VIEW_DENSITIES[density]}
        />
      </div>
    </div>
  );
}

function DaySidebar({ day }: { day: WorkspaceDay }) {
  const pickupNotes = day.sideNotes.filter((note) => note.type === 'pickup');
  const mealNotes = day.sideNotes.filter((note) => note.type === 'meal');
  const todoNotes = day.sideNotes.filter((note) => note.type === 'todo');
  const otherNotes = day.sideNotes.filter((note) => note.type === 'note');

  return (
    <aside className="border-b border-border bg-white p-4 xl:min-h-[calc(100vh-129px)] xl:border-b-0 xl:border-r">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">星期</p>
          <h2 className="text-2xl font-semibold text-foreground">
            {day.label}
            <span className="ml-2 text-sm font-medium text-muted-foreground">
              {day.englishLabel}
            </span>
          </h2>
        </div>
        <Badge variant="outline" className="rounded-md">
          {day.itemCount} 筆
        </Badge>
      </div>

      <div className="mt-5 grid gap-4">
        <SideNoteGroup title="接送" notes={pickupNotes} />
        <SideNoteGroup title="訂餐" notes={mealNotes} />
        <SideNoteGroup title="待辦" notes={todoNotes} />
        <SideNoteGroup title="備忘" notes={otherNotes} />
      </div>
    </aside>
  );
}

function SideNoteGroup({
  title,
  notes,
}: {
  title: string;
  notes: WorkspaceSideNote[];
}) {
  if (notes.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="text-xs text-muted-foreground">{notes.length}</span>
      </div>
      <div className="grid gap-2">
        {notes.map((note) => {
          const Icon = sideNoteIcon[note.type];
          return (
            <div
              key={note.id}
              className="rounded-md border border-border bg-[#fbfbfc] px-3 py-2"
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded bg-white text-muted-foreground ring-1 ring-border">
                  <Icon size={13} />
                </span>
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-foreground">
                    {[note.index, note.title].filter(Boolean).join('. ')}
                  </p>
                  {(note.detail || note.amount) && (
                    <p className="mt-0.5 break-words text-xs text-muted-foreground">
                      {[note.detail, note.amount].filter(Boolean).join(' / ')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ScheduleGrid({
  day,
  sections,
  density,
}: {
  day: WorkspaceDay;
  sections: WorkspaceSection[];
  density: (typeof VIEW_DENSITIES)[ViewDensity];
}) {
  const templateColumns = `${density.timeWidth}px repeat(${sections.length}, ${density.resourceWidth}px)`;
  const gridWidth =
    density.timeWidth + sections.length * density.resourceWidth;

  return (
    <section className="min-w-0 overflow-x-auto">
      <div style={{ width: gridWidth }}>
        <div
          className="sticky top-0 z-20 grid border-b border-border bg-white"
          style={{ gridTemplateColumns: templateColumns }}
        >
          <div className="sticky left-0 z-30 border-r border-border bg-white px-3 py-2 text-xs font-semibold text-muted-foreground">
            時間
          </div>
          {sections.map((section) => (
            <div
              key={section.id}
              className={cn(
                'border-r border-border px-3 py-2 text-xs font-semibold',
                headerToneClasses[section.tone]
              )}
            >
              {section.label}
            </div>
          ))}
        </div>

        <div className="relative">
          <CurrentTimeLine
            day={day}
            sections={sections}
            templateColumns={templateColumns}
            slotHeight={density.slotHeight}
          />
          {day.slots.map((slot) => (
            <div
              key={slot.id}
              className="grid border-b border-border/80"
              style={{ gridTemplateColumns: templateColumns, height: density.slotHeight }}
            >
              <div className="sticky left-0 z-10 border-r border-border bg-white px-2 py-2">
                <p className="text-sm font-semibold leading-none text-foreground">
                  {slot.time}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {slot.minuteLabel}
                </p>
              </div>
              {sections.map((section) => {
                const items = slot.items.filter((item) => item.sectionId === section.id);
                return (
                  <div
                    key={`${slot.id}-${section.id}`}
                    className="h-full overflow-y-auto border-r border-border/70 bg-white/70 p-1"
                  >
                    <div className="grid gap-1">
                      {items.map((item) => (
                        <ScheduleCard
                          key={item.id}
                          item={item}
                          section={section}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CurrentTimeLine({
  day,
  sections,
  templateColumns,
  slotHeight,
}: {
  day: WorkspaceDay;
  sections: WorkspaceSection[];
  templateColumns: string;
  slotHeight: number;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const currentDayKey = getDayKey(now);
  if (day.id !== currentDayKey || day.slots.length === 0) {
    return null;
  }

  const firstSlot = parseMinutes(day.slots[0].time);
  const parsedLastSlot = parseMinutes(day.slots[day.slots.length - 1].time);
  const lastSlot = parsedLastSlot === null ? null : parsedLastSlot + 15;
  if (firstSlot === null || lastSlot === null) {
    return null;
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const totalHeight = day.slots.length * slotHeight;
  const rawTop = ((currentMinutes - firstSlot) / 15) * slotHeight;
  const top = Math.max(0, Math.min(totalHeight, rawTop));
  const timeLabel = `${String(now.getHours()).padStart(2, '0')}:${String(
    now.getMinutes()
  ).padStart(2, '0')}`;

  return (
    <div
      className="pointer-events-none absolute right-0 left-0 z-20"
      style={{ top }}
    >
      <div className="grid" style={{ gridTemplateColumns: templateColumns }}>
        <div className="sticky left-0 z-30 flex items-center justify-end bg-white pr-2">
          <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {timeLabel}
          </span>
        </div>
        <div
          className="flex items-center"
          style={{ gridColumn: `2 / span ${sections.length}` }}
        >
          <span className="size-2 rounded-full bg-red-600" />
          <span className="h-0.5 flex-1 bg-red-600" />
        </div>
      </div>
    </div>
  );
}

function ScheduleCard({
  item,
  section,
}: {
  item: WorkspaceItem;
  section: WorkspaceSection;
}) {
  return (
    <div
      className={cn(
        'rounded-md border px-2 py-1 shadow-sm',
        toneClasses[section.tone]
      )}
      title={`${item.cell} ${item.raw.join(' / ')}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-[11px] font-semibold leading-snug">
            {item.title}
          </p>
          {item.subtitle && (
            <p className="mt-0.5 break-words text-[10px] leading-snug opacity-75">
              {item.subtitle}
            </p>
          )}
        </div>
        <span className="shrink-0 rounded bg-white/70 px-1 py-0.5 text-[10px] font-medium opacity-80">
          {kindLabels[item.kind]}
        </span>
      </div>
    </div>
  );
}

function getDayKey(date: Date) {
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][date.getDay()];
}

function parseMinutes(value: string): number | null {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}
