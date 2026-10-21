import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";

import { AmbassadorPicker } from "@/components/ambassador-picker";
import { Note } from "@/components/ui/feedback";
import {
  listPreviewablePeople,
  startViewingAs,
  stopViewingAs,
} from "@/lib/view-as-actions";
import { getViewer } from "@/lib/view-as";

/**
 * The admin's way into a student's screens.
 *
 * This replaces a banner that apologised for the page. An admin owns no survey
 * link, no submission and no ledger row, so the ambassador screens rendered
 * empty for them and the banner explained that the emptiness was expected —
 * which left "check what students see" as something the app could describe but
 * not do.
 *
 * Picking somebody re-points every read model at that student, so the same
 * screens fill with the same data the student would see. The bar stays on the
 * page throughout, in a colour that is not the app's own, because the one
 * failure that matters here is forgetting whose screen you are looking at.
 */
export async function ViewAsBar() {
  const viewer = await getViewer();
  if (!viewer) return null;

  if (viewer.isPreview) {
    return (
      <div className="mb-5 rounded-xl border-2 border-amber-500 bg-amber-50 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-[13.5px] font-bold text-amber-950">
            <Eye className="size-4 shrink-0" aria-hidden />
            <span>
              Previewing <strong>{viewer.subjectName}</strong>&rsquo;s view —
              read-only, nothing you do here is saved.
            </span>
          </p>

          <form action={stopViewingAs}>
            <button
              type="submit"
              className="tap inline-flex items-center gap-1.5 rounded-full bg-amber-950 px-3.5 py-1.5 text-[13px] font-bold text-white transition-colors hover:bg-amber-900"
            >
              <EyeOff className="size-3.5" aria-hidden />
              Stop preview
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Not previewing. Only an admin gets the picker — for a student this whole
  // component renders nothing, which is why the list comes back empty.
  const people = await listPreviewablePeople();
  if (people.length === 0) return null;

  return (
    <Note tone="brand" title="You're signed in as an admin" className="mb-5">
      <p>
        This is the ambassador view, and an admin has no referral code, survey
        link or task progress of their own — so these screens are empty for you.
        Pick an ambassador to see their screens exactly as they do.
      </p>

      {/* Active ambassadors only — invited and suspended people are left out
          by listPreviewablePeople. */}
      <AmbassadorPicker people={people} action={startViewingAs} />

      <div className="mt-3">
        <Link href="/admin" className="font-semibold underline hover:no-underline">
          Return to admin dashboard
        </Link>
      </div>
    </Note>
  );
}
