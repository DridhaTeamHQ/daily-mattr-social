import { redirect } from "next/navigation";

import { BottomNav, TopNav } from "@/components/app-nav";
import { Note } from "@/components/ui/feedback";
import { getDashboard, isDemoMode } from "@/lib/queries";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const data = await getDashboard();

  // `proxy.ts` already bounced signed-out users, but it does optimistic checks
  // only — this is the one that actually matters.
  if (!data) redirect("/login");

  return (
    <div className="min-h-dvh bg-canvas">
      <TopNav name={data.profile.full_name} />

      <main className="mx-auto max-w-5xl px-4 pt-6 pb-24 sm:px-6 sm:pb-10">
        {isDemoMode() && (
          <Note tone="warn" title="Demo data" className="mb-5">
            No Supabase project is connected yet, so these screens are showing
            fixtures. Nothing you do here is saved. Fill the three Supabase
            values in <code className="font-mono">.env.local</code> to switch to
            live data.
          </Note>
        )}

        {children}
      </main>

      <BottomNav />
    </div>
  );
}
