import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { SurveyBuilder } from "@/components/survey-builder";
import { requireAdmin } from "@/lib/admin/queries";

export const metadata = { title: "New survey" };

export default async function NewSurveyPage() {
  await requireAdmin();

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/surveys"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-soft hover:text-ink"
        >
          <ArrowLeft className="size-3.5" />
          Surveys
        </Link>

        <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-ink">
          New survey
        </h1>
        <p className="mt-1 text-[13.5px] text-ink-soft">
          Saved as a draft. Publishing is separate — that&apos;s what issues a
          link to every active ambassador and notifies them.
        </p>
      </div>

      <SurveyBuilder />
    </div>
  );
}
