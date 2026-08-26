import "server-only";

/**
 * Writing a CSV, the way Excel actually reads it.
 *
 * The opposite direction from `csv.ts`, which parses an admin's uploaded
 * roster — this builds the files the admin downloads. Kept apart because that
 * one runs in the browser for the import dry run and this one must not: these
 * files carry emails and phone numbers and are assembled server-side only.
 *
 * Three export routes had each grown their own copy of `csvCell`, identical
 * except for which types they happened to accept. Escaping rules are exactly
 * the kind of thing that gets fixed in one copy and left broken in the others.
 */

/**
 * One cell, quoted and defused.
 *
 * Everything is quoted rather than only the cells that look like they need it:
 * a name with a comma and a college with a newline both exist in this data, and
 * "quote it when it looks risky" is the rule that eventually misjudges one.
 */
export function csvCell(value: string | number | boolean | null): string {
  const raw = value === null ? "" : String(value);
  // Excel executes a leading =, +, - or @. An apostrophe defuses it invisibly.
  // Without this a name like "-Ravi" is a formula, and a crafted one is an
  // attack on whoever opens the file.
  const guarded = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/**
 * A finished CSV download.
 *
 * The BOM is what makes Excel read the file as UTF-8; without it Indian names
 * arrive mangled, which is the file's credibility gone on row one. CRLF for the
 * same reason — it is what every spreadsheet on Windows expects.
 */
export function csvResponse(
  filename: string,
  header: string[],
  rows: (string | number | boolean | null)[][],
): Response {
  const lines = [
    header.map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(",")),
  ];

  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      // These files carry names, emails and phone numbers. Nothing in front of
      // the app should be holding a copy.
      "cache-control": "no-store",
    },
  });
}
