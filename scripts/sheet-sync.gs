/**
 * Google Apps Script for the installs sheet. Paste into Extensions → Apps Script.
 *
 * Editing "Installs now" recalculates "Total" (this run's installs), and this
 * sends that row's Referral code + Total to the website, which sets the
 * ambassador's count for the active run. `syncAll` pushes every row at once.
 *
 * Setup, once:
 *   1. Project Settings → Script properties → add
 *        SYNC_URL     https://<your-site>/api/sheet-sync
 *        SYNC_SECRET  the same value as SHEET_SYNC_SECRET on the website
 *   2. Triggers → Add trigger → onInstallsEdit · From spreadsheet · On edit
 *      (an installable trigger: the simple onEdit is not allowed to call URLs)
 *   3. Run syncAll once from the editor and approve the permissions.
 *
 * Headers are found by name, so columns can move. When the next run starts,
 * add its "as of" column and point Total's formula at it — Total must always
 * be installs since the current run began.
 */

const SHEET_NAME = "Sheet1";
const CODE_HEADER = "Referral code";
const NOW_HEADER = "Installs  now"; // two spaces, as in the sheet
const TOTAL_HEADER = "Total";

function onInstallsEdit(e) {
  const sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_NAME) return;

  const cols = headerColumns_(sheet);
  const nowCol = cols[norm_(NOW_HEADER)];
  // Only edits that touch "Installs now", below the header row.
  if (!nowCol || e.range.getColumn() > nowCol || e.range.getLastColumn() < nowCol) return;
  if (e.range.getLastRow() < 2) return;

  SpreadsheetApp.flush(); // let the Total formula catch up before reading it
  const first = Math.max(2, e.range.getRow());
  const count = e.range.getLastRow() - first + 1;
  // A cleared "Installs now" cell is someone mid-edit, not a count of zero —
  // sending it would void every install and re-add them a second later.
  const rows = readRows_(sheet, cols, first, count).filter((r) => r.now !== "");
  const result = push_(rows);
  Logger.log(JSON.stringify(result));
  // Throwing marks the run Failed in Executions, so a skipped row is visible.
  if (result && (result.failed.length || result.unknown.length)) {
    throw new Error("Not synced: " + JSON.stringify({ failed: result.failed, unknown: result.unknown }));
  }
}

function syncAll() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  const cols = headerColumns_(sheet);
  const result = push_(readRows_(sheet, cols, 2, sheet.getLastRow() - 1));
  Logger.log(JSON.stringify(result, null, 2));
}

function readRows_(sheet, cols, first, count) {
  const codeCol = cols[norm_(CODE_HEADER)];
  const nowCol = cols[norm_(NOW_HEADER)];
  const totalCol = cols[norm_(TOTAL_HEADER)];
  if (!codeCol || !nowCol || !totalCol) {
    throw new Error("Can't find the Referral code, Installs now or Total column.");
  }
  if (count < 1) return [];

  const codes = sheet.getRange(first, codeCol, count, 1).getValues();
  const nows = sheet.getRange(first, nowCol, count, 1).getValues();
  const totals = sheet.getRange(first, totalCol, count, 1).getValues();
  const rows = codes.map((c, i) => ({ code: String(c[0]).trim(), now: nows[i][0], total: totals[i][0] }));

  // Installs typed in but no Total: the row is missing its formula (new rows
  // usually are). Say so rather than skip it without a word.
  const noFormula = rows.filter((r) => r.code && r.now !== "" && r.total === "");
  if (noFormula.length) {
    throw new Error(
      "Total is empty for " + noFormula.map((r) => r.code).join(", ") +
        " — copy the Total formula down to these rows.",
    );
  }
  return rows.filter((r) => r.code && r.total !== "");
}

function push_(rows) {
  if (!rows.length) return null;
  const props = PropertiesService.getScriptProperties();
  const res = UrlFetchApp.fetch(props.getProperty("SYNC_URL"), {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + props.getProperty("SYNC_SECRET") },
    payload: JSON.stringify({ rows }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    // A 404 comes back as the site's whole "page not found" page; the start is enough.
    throw new Error("Sync failed (" + res.getResponseCode() + "): " + res.getContentText().slice(0, 300));
  }
  return JSON.parse(res.getContentText());
}

function headerColumns_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const cols = {};
  headers.forEach((h, i) => (cols[norm_(h)] = i + 1));
  return cols;
}

// "Installs  now" and "installs now" are the same header.
function norm_(h) {
  return String(h).toLowerCase().replace(/\s+/g, " ").trim();
}
