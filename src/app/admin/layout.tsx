import { CircleAlert } from "lucide-react";

import { AdminAssistant } from "@/components/admin-assistant";
import { AdminNav } from "@/components/admin-nav";
import { aiEnabled } from "@/lib/ai";
import { getOverview, requireAdmin } from "@/lib/admin/queries";
import { getViewingScope } from "@/lib/programme-version";

export const metadata = {
  title: { default: "Admin", template: "%s · dailymattr Admin" },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Redirects non-admins. The database would refuse them anyway — every admin
  // policy is `using (public.is_admin())` — but an empty page is a bad way to
  // find that out.
  const profile = await requireAdmin();
  const [overview, scope] = await Promise.all([
    getOverview(),
    getViewingScope(),
  ]);

  return (
    <div className="min-h-dvh bg-canvas">
      <AdminNav
        name={profile.full_name || profile.email}
        queueCount={overview.queue.pending + overview.queue.needsReview}
        versions={scope.versions}
        viewingVersion={scope.version}
      />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Said on every screen, not just the one that switched. The figures
            below look exactly like live ones, and the single worst outcome
            here is an admin acting on last run's numbers believing they are
            this week's. */}
        {!scope.isActive && (
          <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border-2 border-amber-500 bg-amber-50 px-4 py-3">
            <CircleAlert className="size-4 shrink-0 text-amber-900" aria-hidden />
            <p className="text-[13.5px] font-bold text-amber-950">
              Reading <strong>{scope.label}</strong> — an earlier run of the
              programme. These figures are final and nothing here can be
              edited. Switch runs in the bar above to come back.
            </p>
          </div>
        )}

        {children}
      </main>

      {/* Hidden entirely without an API key, rather than offering a button
          that opens a panel which can only apologise. */}
      {aiEnabled() && <AdminAssistant />}
    </div>
  );
}
