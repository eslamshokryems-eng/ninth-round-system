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
