import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AmbassadorImport } from "@/components/ambassador-import";
import { Card, CardBody } from "@/components/ui/card";
import { Note } from "@/components/ui/feedback";
import { requireAdmin } from "@/lib/admin/queries";

export const metadata = { title: "Import ambassadors" };

export default async function ImportPage() {
  await requireAdmin();

  return (
    <div className="stagger space-y-5">
      <div>
        <Link
          href="/admin/ambassadors"
          className="inline-flex items-center gap-1.5 text-[13px] font-extrabold text-ink-soft hover:text-ink"
        >
          <ArrowLeft className="size-3.5" />
          Ambassadors
        </Link>
        <h1 className="display mt-2 text-[24px] leading-none text-ink">
          Import from a CSV
        </h1>
        <p className="mt-2 text-[13px] font-semibold text-ink-soft">
          Adds a batch of ambassadors at once and issues each of them a
          temporary password.
        </p>
      </div>

      <Note tone="brand" title="Nobody gets an email">
        Accounts are created with a temporary password that you pass on however
        you already talk to them. They choose their own on first sign-in. That
        is deliberate — it means the programme needs no mail server, and an
        invite can never sit unread in a spam folder.
      </Note>

      <Card>
        <CardBody>
          <AmbassadorImport />
        </CardBody>
      </Card>
    </div>
  );
}
