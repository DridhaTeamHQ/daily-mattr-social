import { AdminAssistant } from "@/components/admin-assistant";
import { AdminNav } from "@/components/admin-nav";
import { aiEnabled } from "@/lib/ai";
import { getOverview, requireAdmin } from "@/lib/admin/queries";

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
  const overview = await getOverview();

  return (
    <div className="min-h-dvh bg-canvas">
      <AdminNav
        name={profile.full_name || profile.email}
        queueCount={overview.queue.pending + overview.queue.needsReview}
      />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>

      {/* Hidden entirely without an API key, rather than offering a button
          that opens a panel which can only apologise. */}
      {aiEnabled() && <AdminAssistant />}
    </div>
  );
}
