"use client";

import { usePathname } from "next/navigation";

import { NavSelect, type NavOption } from "@/components/nav-select";

/**
 * The Ambassadors section switcher.
 *
 * Six views of the same people — who they are, what they did on campaigns and
 * surveys, how they rank, what they referred, what they are owed. A tab strip
 * of six wraps on a laptop and is unusable on a phone, so this is a dropdown
 * and the current view is its value.
 */
const VIEWS: NavOption[] = [
  { value: "/admin/ambassadors", label: "Dashboard" },
  { value: "/admin/ambassadors/campaigns", label: "Campaigns" },
  { value: "/admin/ambassadors/surveys", label: "Surveys" },
  { value: "/admin/leaderboard", label: "Leaderboard" },
  { value: "/admin/referrals", label: "Referrals" },
  { value: "/admin/stipend", label: "Stipend & payouts" },
];

export function AmbassadorNav() {
  const pathname = usePathname();

  // Longest match wins, so /admin/ambassadors/campaigns does not resolve to
  // the /admin/ambassadors dashboard entry.
  const current =
    [...VIEWS]
      .sort((a, b) => b.value.length - a.value.length)
      .find((view) => pathname.startsWith(view.value))?.value ??
    "/admin/ambassadors";

  return <NavSelect label="View" value={current} options={VIEWS} />;
}
