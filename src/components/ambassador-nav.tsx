"use client";

import { usePathname } from "next/navigation";

import { NavSelect, type NavOption } from "@/components/nav-select";

/**
 * The Ambassadors section switcher.
 *
 * Three views of the same people — who they are, what they did on campaigns,
 * what they did on surveys. It is the only way between them: nothing else in
 * the app links to /admin/ambassadors/campaigns or .../surveys, which is why
 * this stays a switcher rather than becoming a shortcut that can be dropped.
 *
 * It used to carry six, the other three being the leaderboard, Installs and
 * stipend. Those now have their own entry in the top bar, and a destination
 * wants one home: while they were in both places the switcher was offering to
 * take you somewhere it would not then be present to bring you back from,
 * because those pages no longer render it.
 */
const VIEWS: NavOption[] = [
  { value: "/admin/ambassadors", label: "Dashboard" },
  { value: "/admin/ambassadors/campaigns", label: "Campaigns" },
  { value: "/admin/ambassadors/surveys", label: "Surveys" },
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
