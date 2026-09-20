import * as XLSX from "xlsx";

export interface ExportSheet {
  name: string;
  rows: Record<string, string | number>[];
}

/** Client-side .xlsx generation — no server round-trip, nothing leaves the browser except the download itself. Sheet names are truncated to Excel's 31-character limit. */
export function exportToExcel(filename: string, sheets: ExportSheet[]): void {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const worksheet = XLSX.utils.json_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31));
  }
  XLSX.writeFile(workbook, filename);
}

/** Same client-side approach as exportToExcel, one sheet's worth as plain .csv — reuses the same `xlsx` dependency rather than adding a new one. */
export function exportToCsv(filename: string, rows: Record<string, string | number>[]): void {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
