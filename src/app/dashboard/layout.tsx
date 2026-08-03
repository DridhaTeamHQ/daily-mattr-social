import { redirect } from "next/navigation";

import { BottomNav, TopNav } from "@/components/app-nav";
import { mustChangePassword } from "@/lib/queries";
import { CelebrationProvider } from "@/components/celebrate";
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

  // A student still on an admin-issued password gets nowhere until they
  // replace it. Checked here rather than in proxy.ts because proxy does
  // optimistic checks only.
  if (await mustChangePassword()) redirect("/welcome");

  // Read literally so Next can inline it. Null when push isn't configured,
  // which makes the bell hide the opt-in rather than offer something broken.
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;

  return (
    <CelebrationProvider>
      <div className="min-h-dvh bg-canvas">
        <TopNav
          name={data.profile.full_name || "You"}
          streak={data.streak}
          notifications={data.notifications}
          vapidPublicKey={vapidPublicKey}
        />

        <main className="mx-auto max-w-5xl px-4 pt-6 pb-28 sm:px-6 sm:pb-12">
          {data.profile.role === "admin" && (
            <Note tone="brand" title="You're signed in as an admin" className="mb-5">
              This is the ambassador view. Admins have no referral code, no
              survey links and no points, so most of these screens will look
              empty — that is expected, not a fault. Sign in as an ambassador
              to see what students see.
            </Note>
          )}

          {isDemoMode() && (
            <Note tone="warn" title="Demo data" className="mb-5">
              No Supabase project is connected yet, so these screens are showing
              fixtures. Nothing you do here is saved.
            </Note>
          )}

          {children}
        </main>

        <BottomNav />
      </div>
    </CelebrationProvider>
  );
}
