/**
 * A small CSV reader, and the ambassador-import row shape.
 *
 * Deliberately not a dependency. The files this handles are spreadsheets an
 * admin exported themselves — a few hundred rows of names, emails and
 * colleges — and the whole grammar needed is quoted fields, doubled quotes and
 * newlines inside quotes. A parser library would be more code to audit than
 * the thirty lines below.
 *
 * No "use server" and no server-only import: the dry run happens in the
 * browser so an admin can see and fix their file before anything reaches the
 * database, and the same code re-validates on the server.
 */

export type CsvRow = Record<string, string>;

/** Splits CSV text into rows, honouring quotes and embedded newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  // Strip the UTF-8 BOM Excel writes, otherwise the first header becomes
  // "﻿name" and never matches a column alias.
  const input = text.replace(/^﻿/, "");

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/**
 * Column aliases.
 *
 * Admins export from Google Sheets, from a college's own list, or type it
 * themselves, so "Full Name", "name" and "student name" all turn up. Matching
 * loosely here costs a few lines and saves the admin editing a header row they
 * did not write.
 */
const COLUMNS: Record<string, string[]> = {
  full_name: ["full name", "name", "student name", "fullname", "ambassador"],
  email: ["email", "email address", "e-mail", "mail"],
  phone: ["phone", "mobile", "contact", "phone number", "whatsapp"],
  college: ["college", "institution", "university", "school"],
  city: ["city", "location", "town"],
  batch: ["batch", "cohort", "intake"],
  joined_as: ["type", "status", "student or professional", "joined as"],
};

function normalise(header: string): string {
  return header.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function mapHeaders(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};

  header.forEach((raw, index) => {
    const key = normalise(raw);
    for (const [field, aliases] of Object.entries(COLUMNS)) {
      if (map[field] === undefined && aliases.includes(key)) map[field] = index;
    }
  });

  return map;
}

export type ImportRow = {
  line: number;
  full_name: string;
  email: string;
  phone: string;
  college: string;
  city: string;
  batch: string;
  joined_as: "student" | "professional";
  error: string | null;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Turns CSV text into candidate rows, each carrying its own error.
 *
 * Bad rows are RETURNED rather than thrown away, so the admin sees "line 14:
 * that isn't an email" and can fix it. Silently skipping them would mean a
 * file of 200 rows importing 190 people with no indication which ten are
 * missing.
 */
export function readAmbassadorCsv(text: string): {
  rows: ImportRow[];
  missingColumns: string[];
} {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], missingColumns: ["full_name", "email"] };

  const [header, ...body] = table;
  const map = mapHeaders(header);

  const missingColumns = ["full_name", "email"].filter(
    (field) => map[field] === undefined,
  );
  if (missingColumns.length > 0) return { rows: [], missingColumns };

  const at = (cells: string[], field: string) =>
    map[field] === undefined ? "" : (cells[map[field]] ?? "").trim();

  const seen = new Set<string>();

  return {
    missingColumns: [],
    rows: body.map((cells, i) => {
      const email = at(cells, "email").toLowerCase();
      const fullName = at(cells, "full_name");
      const type = at(cells, "joined_as").toLowerCase();

      let error: string | null = null;
      if (!fullName) error = "No name";
      else if (!email) error = "No email";
      else if (!EMAIL.test(email)) error = "That doesn't look like an email";
      else if (seen.has(email)) error = "Duplicate of an earlier row";

      if (email) seen.add(email);

      return {
        // +2 because the header is line 1 and humans count from 1.
        line: i + 2,
        full_name: fullName,
        email,
        phone: at(cells, "phone"),
        college: at(cells, "college"),
        city: at(cells, "city"),
        batch: at(cells, "batch"),
        joined_as: type.startsWith("prof") ? "professional" : "student",
        error,
      };
    }),
  };
}

/**
 * A readable temporary password.
 *
 * An admin reads these out or pastes them into WhatsApp one at a time, so the
 * alphabet excludes characters that look alike in most fonts (0/O, 1/l/I).
 * Length plus a digit and a symbol keeps it past the 8-character minimum.
 */
export function tempPassword(): string {
  const letters = "abcdefghijkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";

  const pick = (set: string, n: number) =>
    Array.from(
      { length: n },
      () => set[Math.floor(Math.random() * set.length)],
    ).join("");

  return `${pick(upper, 1)}${pick(letters, 5)}${pick(digits, 3)}#`;
}
