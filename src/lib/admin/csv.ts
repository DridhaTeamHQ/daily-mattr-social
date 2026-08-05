import Papa from "papaparse";

/**
 * Reading an ambassador CSV.
 *
 * Parsing is delegated to papaparse, which was already a dependency. The value
 * added here is the domain half: matching whatever headers an admin's
 * spreadsheet happens to use, and deciding which rows are safe to create
 * accounts from.
 *
 * No "use server" and no server-only import — the dry run runs in the browser
 * so an admin can fix their file before anything reaches the database, and the
 * server re-runs exactly the same code on the raw text.
 */

export type CsvRow = Record<string, string>;

/**
 * Splits CSV text into rows.
 *
 * `skipEmptyLines` drops the trailing blank line every spreadsheet export
 * ends with, which would otherwise arrive as a row with no name and no email
 * and be reported to the admin as an error in their file.
 */
export function parseCsv(text: string): string[][] {
  const { data } = Papa.parse<string[]>(text, {
    skipEmptyLines: "greedy",
  });

  return data.filter((row) => row.some((cell) => cell.trim() !== ""));
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
