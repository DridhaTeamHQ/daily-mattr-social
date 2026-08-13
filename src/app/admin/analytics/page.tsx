import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/admin/queries";

export const metadata = { title: "Completion leaderboard" };

/**
 * Legacy analytics reported the retired balance. Keep existing
 * bookmarks useful by taking administrators to the completion-based report.
 */
export default async function AnalyticsPage() {
  await requireAdmin();
  redirect("/admin/leaderboard");
}
