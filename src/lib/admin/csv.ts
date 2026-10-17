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
  // "College/Office" is what the form and the profile dialog call this field
  // now that ambassadors are not all students, so it is what an admin's own
  // export is headed. Matching only "college" meant a roster exported from
  // this very app imported with the column silently dropped.
  college: [
    "college",
    "college/office",
    "college / office",
    "office",
    "institution",
    "university",
    "school",
    "organisation",
    "organization",
    "company",
  ],
  city: ["city", "location", "town"],
  batch: ["batch", "cohort", "intake"],
  joined_as: ["type", "status", "student or professional", "joined as"],
};

function normalise(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    // A slash is a separator people space differently — "College/Office" and
    // "College / Office" are the same header and must normalise the same way.
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ");
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
const PHONE = /^\+?[\d\s()-]{8,}$/;

/**
 * Columns for a file with no header row, read off its contents.
 *
 * Lists pasted out of a form or a WhatsApp export often start straight at the
 * first person — "Yukesh kiran, 9042722414, yukesh@…" — and refusing them
 * with "needs a name and an email column" sends the admin off to type a
 * header row the importer could have worked out. So when no header matches
 * and the first row itself holds an email address, each column is judged by
 * what most of its first rows look like: the one of addresses is the email,
 * the one of long digit strings is the phone, and the first column left that
 * has letters in it is the name. Anything less clear-cut than that is not
 * guessed at; the admin gets the usual message.
 */
function inferHeaderless(table: string[][]): Record<string, number> | null {
  const first = table[0] ?? [];
  if (!first.some((cell) => EMAIL.test(cell.trim()))) return null;

  const sample = table.slice(0, 20);
  const width = Math.max(...sample.map((row) => row.length));
  const share = (index: number, test: (cell: string) => boolean) =>
    sample.filter((row) => test((row[index] ?? "").trim())).length / sample.length;

  const columns = Array.from({ length: width }, (_, index) => index);
  const email = columns.find((i) => share(i, (c) => EMAIL.test(c)) >= 0.6);
  if (email === undefined) return null;

  const phone = columns.find(
    (i) => i !== email && share(i, (c) => PHONE.test(c)) >= 0.6,
  );
  const name = columns.find(
    (i) => i !== email && i !== phone && share(i, (c) => /[a-z]/i.test(c)) >= 0.6,
  );
  if (name === undefined) return null;

  return {
    full_name: name,
    email,
    ...(phone === undefined ? {} : { phone }),
  };
}

/**
 * Turns CSV text into candidate rows, each carrying its own error.
 *
 * Bad rows are RETURNED rather than thrown away, so the admin sees "line 14:
 * that isn't an email" and can fix it. Silently skipping them would mean a
 * file of 200 rows importing 190 people with no indication which ten are
 * missing.
 */
export function readAmbassadorCsv(
  text: string,
  /**
   * The batch for every row that does not name its own — the "Batch" picker
   * on the import page. A batch column in the file still wins row by row.
   */
  defaultBatch = "",
): {
  rows: ImportRow[];
  missingColumns: string[];
  /** True when there was no header row and the columns were inferred. */
  headerless: boolean;
} {
  const table = parseCsv(text);
  if (table.length === 0) {
    return { rows: [], missingColumns: ["full_name", "email"], headerless: false };
  }

  let headerless = false;
  let map = mapHeaders(table[0]);
  let body = table.slice(1);

  if (map.full_name === undefined && map.email === undefined) {
    const inferred = inferHeaderless(table);
    if (inferred) {
      map = inferred;
      body = table;
      headerless = true;
    }
  }

  const missingColumns = ["full_name", "email"].filter(
    (field) => map[field] === undefined,
  );
  if (missingColumns.length > 0) return { rows: [], missingColumns, headerless };

  const at = (cells: string[], field: string) =>
    map[field] === undefined ? "" : (cells[map[field]] ?? "").trim();

  const seen = new Set<string>();

  return {
    missingColumns: [],
    headerless,
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
        // Spreadsheet line numbers: the header, when there is one, is line 1.
        line: i + (headerless ? 1 : 2),
        full_name: fullName,
        email,
        phone: at(cells, "phone"),
        college: at(cells, "college"),
        city: at(cells, "city"),
        batch: at(cells, "batch") || defaultBatch,
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

  // `crypto.getRandomValues`, not Math.random: this is a password, and it
  // now goes out by email. Available in the browser and in Node alike.
  const pick = (set: string, n: number) =>
    Array.from(crypto.getRandomValues(new Uint32Array(n)), (v) => set[v % set.length]).join("");

  return `${pick(upper, 1)}${pick(letters, 5)}${pick(digits, 3)}#`;
}
