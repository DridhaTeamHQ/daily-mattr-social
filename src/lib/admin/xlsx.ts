import "server-only";

import Papa from "papaparse";

/**
 * Excel files, turned into the CSV the importer already understands.
 *
 * Admins keep their ambassador lists in Excel and Google Sheets, and telling
 * someone to "save as CSV first" is a step that gets skipped and then blamed on
 * the upload. So .xlsx goes in directly and comes out as CSV text, which means
 * the whole of csv.ts — the header aliasing, the per-row validation, the dry
 * run the admin sees before anything is created — is reused unchanged rather
 * than reimplemented for a second file format.
 *
 * Parsed on the server on purpose. The dry run for CSV happens in the browser
 * because papaparse was already there; a spreadsheet parser is far too big to
 * ship to every admin who never uploads one. This costs one round trip and
 * keeps it out of the client bundle entirely.
 */

/** A cell can be a string, a number, a date, a formula result, or rich text. */
function cellToText(value: unknown): string {
  if (value === null || value === undefined) return "";

  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) {
    // Dates are not something this importer reads, but a stray date column
    // must not serialise as "[object Object]" and confuse the header match.
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "object") {
    const object = value as Record<string, unknown>;

    // A formula cell carries both the formula and its last computed result.
    if ("result" in object) return cellToText(object.result);
    // A hyperlink cell (an email column often becomes one) keeps the visible
    // text separately from the mailto: target.
    if ("text" in object) return cellToText(object.text);
    // Rich text arrives as runs that have to be stitched back together.
    if ("richText" in object && Array.isArray(object.richText)) {
      return object.richText
        .map((run) => cellToText((run as { text?: unknown }).text))
        .join("")
        .trim();
    }
    if ("hyperlink" in object) {
      return String(object.hyperlink).replace(/^mailto:/i, "").trim();
    }
  }

  return String(value).trim();
}

export type XlsxReadResult =
  | { ok: true; csv: string; sheet: string; rows: number }
  | { ok: false; message: string };

export async function xlsxToCsv(buffer: ArrayBuffer): Promise<XlsxReadResult> {
  // Imported here rather than at module scope so the cost lands only on an
  // admin who actually uploads a spreadsheet.
  const ExcelJS = (await import("exceljs")).default;

  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(buffer as never);
  } catch {
    return {
      ok: false,
      message:
        "That file couldn't be read as a spreadsheet. If it's an old .xls, open it in Excel and save it as .xlsx or .csv.",
    };
  }

  // The first sheet with anything on it. A workbook whose first tab is a blank
  // "Sheet1" left over from a template is common enough to be worth handling.
  const sheet = workbook.worksheets.find((w) => w.actualRowCount > 0);
  if (!sheet) return { ok: false, message: "That spreadsheet has no rows in it." };

  const table: string[][] = [];

  sheet.eachRow({ includeEmpty: false }, (row) => {
    // `row.values` is 1-based with a hole at index 0, which is why this reads
    // the cells by column index instead of using the array directly.
    const cells: string[] = [];
    const width = Math.max(sheet.columnCount, row.cellCount);
    for (let column = 1; column <= width; column++) {
      cells.push(cellToText(row.getCell(column).value));
    }

    // Trailing empty columns are an artefact of the sheet's declared width.
    while (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
    if (cells.some((cell) => cell !== "")) table.push(cells);
  });

  if (table.length === 0) {
    return { ok: false, message: "That spreadsheet has no rows in it." };
  }

  return {
    ok: true,
    // Back to CSV text, so the browser preview and the server-side re-parse
    // both run the exact same code path they do for an uploaded .csv.
    csv: Papa.unparse(table),
    sheet: sheet.name,
    rows: table.length - 1,
  };
}
