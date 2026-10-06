import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { ExpandableRow } from "@/components/expandable-row";
import { ProofImage } from "@/components/proof-image";
import { StatusBadge } from "@/components/ui/badge";
import type { CampaignParticipant } from "@/lib/admin/queries";
import { formatDate, initials } from "@/lib/utils";

/**
 * "Who took part", with each person's uploads behind their row.
 *
 * The row used to end in "0/1 approved", which says nothing approved and not
 * why — a rejection and an upload nobody has looked at yet read the same. Now
 * the row names the outcome in words, and opening it shows each upload: the
 * task, the proof itself, and the reviewer's reason when it was sent back.
 */
export function ParticipantList({
  participants,
}: {
  participants: CampaignParticipant[];
}) {
  return (
    <ul className="grid items-start gap-x-8 lg:grid-cols-2">
      {participants.map((p) => (
        <ExpandableRow
          key={p.id}
          className="border-b border-line"
          label={p.done === 1 ? "View submission" : `View ${p.done} submissions`}
          summary={
            <>
              <span
                aria-hidden
                className="grid size-8 shrink-0 place-items-center rounded-full bg-gray-100 text-[11px] font-extrabold text-ink"
              >
                {initials(p.name)}
              </span>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/ambassadors/${p.id}`}
                  className="block truncate text-[13.5px] font-extrabold text-ink hover:underline"
                >
                  {p.name}
                </Link>
                <p className="truncate text-[12px] text-ink-soft">
                  {outcomeLine(p)}
                </p>
              </div>
              <Outcome participant={p} />
            </>
          }
        >
          <ul className="space-y-3 rounded-xl border border-gray-200 bg-canvas-sunk/40 p-3">
            {p.attempts.map((a) => (
              <li
                key={a.id}
                className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-surface p-3 sm:flex-row"
              >
                {a.signedUrl && (
                  <ProofImage
                    src={a.signedUrl}
                    alt={`${p.name} — ${a.taskLabel}`}
                    className="aspect-[3/4] w-full shrink-0 bg-gray-100 sm:w-28"
                  />
                )}

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[13px] font-extrabold text-ink">
                      {a.taskLabel}
                    </p>
                    <StatusBadge status={a.status} />
                  </div>

                  <p className="text-[12px] text-ink-soft">
                    Uploaded {formatDate(a.uploaded_at, true)}
                    {a.attempt > 1 ? ` · attempt ${a.attempt}` : ""}
                    {a.reviewed_at ? ` · reviewed ${formatDate(a.reviewed_at, true)}` : ""}
                  </p>

                  {(a.status === "rejected" || a.status === "revoked") && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                      <p className="text-[11px] font-bold tracking-wide text-red-800 uppercase">
                        {a.status === "revoked" ? "Why it was revoked" : "Why it was rejected"}
                      </p>
                      <p className="mt-0.5 text-[13px] font-semibold text-red-900">
                        {a.reject_reason || "No reason was given."}
                      </p>
                    </div>
                  )}

                  {a.review_note && (
                    <p className="text-[12.5px] text-ink-soft">
                      <span className="font-bold text-ink">Reviewer note: </span>
                      {a.review_note}
                    </p>
                  )}

                  {a.proof_url && (
                    <a
                      href={a.proof_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-full items-center gap-1 truncate text-[12.5px] font-bold text-brand hover:underline"
                    >
                      <span className="truncate">{a.proof_url}</span>
                      <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                    </a>
                  )}

                  {a.proof_text && (
                    <p className="rounded-lg bg-gray-50 px-3 py-2 text-[12.5px] whitespace-pre-wrap text-ink">
                      {a.proof_text}
                    </p>
                  )}

                  {!a.signedUrl && !a.proof_url && !a.proof_text && (
                    <p className="text-[12px] font-semibold text-ink-faint">
                      No proof attached.
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </ExpandableRow>
      ))}
    </ul>
  );
}

/** "1 submission · 1 rejected", in words, so the row explains itself. */
function outcomeLine(p: CampaignParticipant): string {
  const parts = [
    `${p.done} ${p.done === 1 ? "submission" : "submissions"}`,
    p.approved ? `${p.approved} approved` : null,
    p.rejected ? `${p.rejected} rejected` : null,
    p.waiting ? `${p.waiting} waiting for review` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

/** The one-word outcome at the end of the row. */
function Outcome({ participant: p }: { participant: CampaignParticipant }) {
  // One badge only when every upload ended the same way. A mix — one task
  // approved, another sent back — is spelt out by the line under the name,
  // and a single badge would pick one half of it to show.
  const latest = p.attempts[0];
  if (!latest) return null;
  const mixed = [p.approved, p.rejected, p.waiting].filter(Boolean).length > 1;
  if (mixed) return null;
  return <StatusBadge status={latest.status} />;
}
