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
  push_(readRows_(sheet, cols, first, count));
}

function syncAll() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  const cols = headerColumns_(sheet);
  const result = push_(readRows_(sheet, cols, 2, sheet.getLastRow() - 1));
  Logger.log(JSON.stringify(result, null, 2));
}

function readRows_(sheet, cols, first, count) {
  const codeCol = cols[norm_(CODE_HEADER)];
  const totalCol = cols[norm_(TOTAL_HEADER)];
  if (!codeCol || !totalCol) throw new Error("Can't find the Referral code or Total column.");
  if (count < 1) return [];

  const codes = sheet.getRange(first, codeCol, count, 1).getValues();
  const totals = sheet.getRange(first, totalCol, count, 1).getValues();
  return codes
    .map((c, i) => ({ code: String(c[0]).trim(), total: totals[i][0] }))
    .filter((r) => r.code && r.total !== "");
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
