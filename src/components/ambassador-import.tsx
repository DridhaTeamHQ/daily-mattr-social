"use client";

import * as React from "react";
import { CircleAlert, Copy, Download, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { readAmbassadorCsv, type ImportRow } from "@/lib/admin/csv";
import {
  convertSpreadsheet,
  importAmbassadors,
  type ImportResult,
} from "@/lib/admin/import-actions";
import { cn } from "@/lib/utils";

/**
 * Bulk import with a dry run.
 *
 * The file is parsed in the browser and shown back before anything is created,
 * because account creation is not undoable — a typo'd address becomes a real
 * auth user that has to be deleted by hand. Seeing "line 14: that isn't an
 * email" beforehand costs one glance; finding out afterwards costs cleanup.
 */
export function AmbassadorImport() {
  const [rows, setRows] = React.useState<ImportRow[] | null>(null);
  const [csvText, setCsvText] = React.useState("");
  const [missing, setMissing] = React.useState<string[]>([]);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [sendEmails, setSendEmails] = React.useState(true);
  const [reading, setReading] = React.useState(false);
  const [fileNote, setFileNote] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const valid = rows?.filter((r) => !r.error) ?? [];
  const invalid = rows?.filter((r) => r.error) ?? [];

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setResult(null);
    setFileNote(null);
    setRows(null);
    setMissing([]);

    // A spreadsheet is converted on the server first — the parser is far too
    // big to ship to every admin, most of whom upload a .csv. Everything after
    // that point is identical for both formats.
    const isSpreadsheet = /\.(xlsx|xlsm|xls)$/i.test(file.name);

    let text: string;

    if (isSpreadsheet) {
      setReading(true);
      try {
        const buffer = await file.arrayBuffer();
        let binary = "";
        const bytes = new Uint8Array(buffer);
        // Chunked, because spreading a multi-megabyte array into
        // String.fromCharCode blows the call stack.
        for (let i = 0; i < bytes.length; i += 8192) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        }

        const converted = await convertSpreadsheet(btoa(binary));
        if (!converted.ok) {
          setFileNote(converted.message);
          return;
        }
        text = converted.csv;
        setFileNote(converted.message);
      } finally {
        setReading(false);
      }
    } else {
      text = await file.text();
    }

    const parsed = readAmbassadorCsv(text);
    setCsvText(text);
    setRows(parsed.rows);
    setMissing(parsed.missingColumns);
  }

  function copyCredentials() {
    if (!result?.created.length) return;
    const lines = result.created.map(
      (c) => `${c.fullName}\t${c.email}\t${c.password}`,
    );
    void navigator.clipboard.writeText(lines.join("\n"));
  }

  function downloadCredentials() {
    if (!result?.created.length) return;

    const escape = (value: string) =>
      `"${(/^[=+\-@]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`;

    const csv = [
      ["Name", "Email", "Temporary password", "Emailed"].map(escape).join(","),
      ...result.created.map((c) =>
        [
          c.fullName,
          c.email,
          c.password,
          c.emailed === "sent" ? "yes" : c.emailed === "failed" ? "FAILED" : "no",
        ]
          .map(escape)
          .join(","),
      ),
    ].join("\r\n");

    const url = URL.createObjectURL(
      new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "dailymattr-temporary-passwords.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <label
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl",
          "border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center",
          "hover:border-brand hover:bg-brand-tint",
        )}
      >
        {reading ? (
          <Loader2 className="size-6 animate-spin text-ink-soft" />
        ) : (
          <Upload className="size-6 text-ink-soft" />
        )}
        <span className="text-[14px] font-extrabold text-ink">
          {reading ? "Reading the spreadsheet…" : "Choose a CSV or Excel file"}
        </span>
        <span className="max-w-md text-[12.5px] font-semibold text-ink-soft">
          Needs a name and an email column. Phone, college/office, city, batch and
          type are used if they&apos;re there. Header names are matched loosely,
          so &quot;Full Name&quot; and &quot;name&quot; both work.
        </span>
        <input
          type="file"
          accept=".csv,text/csv,.xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={onFile}
          disabled={reading}
          className="sr-only"
        />
      </label>

      {fileNote && (
        <p className="text-[12.5px] font-semibold text-ink-soft">{fileNote}</p>
      )}

      {missing.length > 0 && (
        <p className="flex items-center gap-2 text-[13px] font-bold text-bad">
          <CircleAlert className="size-4" />
          That file needs a {missing.join(" and ")} column.
        </p>
      )}

      {/* ─── Dry run ───────────────────────────────────────────────────────── */}
      {rows && rows.length > 0 && !result && (
        <div className="rounded-xl border border-gray-200">
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-3">
            <span className="text-[13.5px] font-extrabold text-ink">
              {valid.length} ready
            </span>
            {invalid.length > 0 && (
              <span className="text-[13.5px] font-extrabold text-bad">
                · {invalid.length} will be skipped
              </span>
            )}
            <div className="ml-auto flex items-center gap-3">
              {/* On by default: the reason to import a list is to get those
                  people into the programme, and an ambassador who was never
                  told their password is not in it. Off exists for a re-import
                  or a migration, where mailing everyone again is the wrong
                  thing. */}
              <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-bold text-ink">
                <input
                  type="checkbox"
                  checked={sendEmails}
                  onChange={(e) => setSendEmails(e.target.checked)}
                  className="size-4 accent-[var(--color-brand)]"
                />
                Email them their login
              </label>

              <Button
                size="sm"
                disabled={valid.length === 0 || pending}
                onClick={() =>
                  startTransition(async () => {
                    setResult(await importAmbassadors(csvText, sendEmails));
                  })
                }
              >
                {pending ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Upload aria-hidden />
                )}
                Import {valid.length}
              </Button>
            </div>
          </div>

          {pending && sendEmails && valid.length > 20 && (
            <p className="border-t border-gray-200 px-4 py-2 text-[12px] font-semibold text-ink-soft">
              Sending {valid.length} emails one at a time — this takes a
              moment. Don&apos;t close the tab.
            </p>
          )}

          <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto">
            {rows.slice(0, 100).map((row) => (
              <li
                key={row.line}
                className="flex items-center gap-3 px-4 py-2 text-[13px]"
              >
                <span className="w-8 shrink-0 text-ink-faint tabular">
                  {row.line}
                </span>
                <span className="min-w-0 flex-1 truncate font-bold text-ink">
                  {row.full_name || "—"}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink-soft">
                  {row.email || "—"}
                </span>
                {row.error ? (
                  <span className="shrink-0 font-bold text-bad">{row.error}</span>
                ) : (
                  <span className="shrink-0 text-ink-faint">
                    {[row.city, row.batch].filter(Boolean).join(" · ") || "ok"}
                  </span>
                )}
              </li>
            ))}
          </ul>

          {rows.length > 100 && (
            <p className="border-t border-gray-200 px-4 py-2 text-[12px] font-semibold text-ink-soft">
              Showing the first 100 of {rows.length}. All of them import.
            </p>
          )}
        </div>
      )}

      {/* ─── Result ────────────────────────────────────────────────────────── */}
      {result && (
        <div className="space-y-3">
          <p
            className={cn(
              "text-[14px] font-extrabold",
              result.ok ? "text-ok" : "text-bad",
            )}
          >
            {result.message}
          </p>

          {result.created.length > 0 && (
            <div className="rounded-xl border border-gray-200">
              <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-3">
                <span className="text-[13px] font-extrabold text-ink">
                  Temporary passwords
                </span>
                {/* Shown once and never again: they are not stored anywhere in
                    readable form, so this list is the only chance to keep
                    them. */}
                {/* What to do next depends entirely on whether the email
                    landed, so that is the sentence here rather than a generic
                    warning. */}
                <span className="text-[12px] font-semibold text-ink-soft">
                  {result.emailSummary.failed > 0
                    ? `${result.emailSummary.failed} couldn't be emailed — pass those on yourself.`
                    : result.emailSummary.sent === result.created.length
                      ? "All of them were emailed. Keep these in case someone says it never arrived."
                      : "Save these now — they can't be shown again."}
                </span>
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="secondary" onClick={copyCredentials}>
                    <Copy aria-hidden />
                    Copy
                  </Button>
                  <Button size="sm" variant="secondary" onClick={downloadCredentials}>
                    <Download aria-hidden />
                    CSV
                  </Button>
                </div>
              </div>

              <ul className="max-h-72 divide-y divide-gray-100 overflow-y-auto">
                {result.created.map((c) => (
                  <li
                    key={c.email}
                    className="flex items-center gap-3 px-4 py-2 text-[13px]"
                  >
                    <span className="min-w-0 flex-1 truncate font-bold text-ink">
                      {c.fullName}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-ink-soft">
                      {c.email}
                    </span>
                    <span
                      title={
                        c.emailed === "sent"
                          ? "Welcome email sent"
                          : c.emailed === "failed"
                            ? "The welcome email did not send — pass this on yourself"
                            : "No email was sent"
                      }
                      className={cn(
                        "shrink-0 text-[11.5px] font-bold",
                        c.emailed === "sent"
                          ? "text-ok"
                          : c.emailed === "failed"
                            ? "text-bad"
                            : "text-ink-faint",
                      )}
                    >
                      {c.emailed === "sent"
                        ? "emailed"
                        : c.emailed === "failed"
                          ? "not emailed"
                          : "no email"}
                    </span>
                    <code className="shrink-0 rounded bg-gray-100 px-2 py-0.5 font-mono text-[12.5px] font-bold text-ink">
                      {c.password}
                    </code>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.failed.length > 0 && (
            <div className="rounded-xl border border-gray-200">
              <p className="border-b border-gray-200 px-4 py-2 text-[13px] font-extrabold text-ink">
                Skipped
              </p>
              <ul className="max-h-56 divide-y divide-gray-100 overflow-y-auto">
                {result.failed.map((f) => (
                  <li
                    key={`${f.line}-${f.email}`}
                    className="flex items-center gap-3 px-4 py-2 text-[13px]"
                  >
                    <span className="w-8 shrink-0 text-ink-faint tabular">
                      {f.line}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-ink-soft">
                      {f.email || "—"}
                    </span>
                    <span className="shrink-0 font-bold text-bad">{f.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
