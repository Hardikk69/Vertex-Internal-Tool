import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ms → "HH:MM:SS"
export function duration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

// ms → "1h 05m"
export function hoursMinutes(ms: number) {
  const m = Math.round(ms / 60000);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

// → "YYYY-MM-DD" / "HH:MM" in the browser's timezone (the format <input type="date|time"> uses)
export const localDate = (d: Date | string) => new Date(d).toLocaleDateString("en-CA");
export const localTime = (d: Date | string) => new Date(d).toTimeString().slice(0, 5);

// ms → "1.50" (decimal hours, for invoices)
export const decimalHours = (ms: number) => (ms / 3_600_000).toFixed(2);

// Downloads rows as a CSV file. Cells starting with = + - @ get a leading ' so
// Excel/Sheets show them as text instead of running them as formulas.
export function downloadCsv(filename: string, rows: string[][]) {
  const cell = (v: string) => `"${v.replace(/^[=+\-@\t\r]/, "'$&").replaceAll('"', '""')}"`;
  const csv = rows.map((r) => r.map(cell).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })); // BOM: Excel reads UTF-8
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href));
}

// first moment of the current month, local time, as ISO
export function startOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

// like Map.groupBy (ES2024), minus the browser-support floor
export function groupBy<T, K>(items: Iterable<T>, key: (item: T) => K) {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = out.get(k);
    if (bucket) bucket.push(item);
    else out.set(k, [item]);
  }
  return out;
}
