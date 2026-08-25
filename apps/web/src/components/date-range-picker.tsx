"use client";

import { TextField } from "./ui/text-field";
import { Button } from "./ui/button";
import { toDateKey } from "./receipts-calendar";

export interface DateRange {
  startDate: string;
  endDate: string;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - day);
  return d;
}

function monthRangeFor(date: Date, monthOffset = 0): DateRange {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset, 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset + 1, 0));
  return { startDate: toDateKey(start), endDate: toDateKey(end) };
}

const PRESETS: { label: string; range: () => DateRange }[] = [
  { label: "Today", range: () => ({ startDate: toDateKey(new Date()), endDate: toDateKey(new Date()) }) },
  { label: "This Week", range: () => ({ startDate: toDateKey(startOfWeek(new Date())), endDate: toDateKey(new Date()) }) },
  { label: "This Month", range: () => monthRangeFor(new Date()) },
  { label: "Last Month", range: () => monthRangeFor(new Date(), -1) },
];

export interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

/** Shared by every Reports tab — preset buttons (Today/This Week/This Month/Last Month) plus explicit From/To fields for a custom range. */
export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex gap-2">
        {PRESETS.map((preset) => (
          <Button key={preset.label} variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => onChange(preset.range())}>
            {preset.label}
          </Button>
        ))}
      </div>
      <TextField
        label="From"
        type="date"
        value={value.startDate}
        onChange={(e) => onChange({ ...value, startDate: e.target.value })}
        className="w-40"
      />
      <TextField
        label="To"
        type="date"
        value={value.endDate}
        onChange={(e) => onChange({ ...value, endDate: e.target.value })}
        className="w-40"
      />
    </div>
  );
}
