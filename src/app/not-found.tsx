import Link from "next/link";
import { Compass } from "lucide-react";

import { Wordmark } from "@/components/logo";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Page not found" };

/**
 * The 404.
 *
 * Without this the app falls back to Next's default page: unstyled, no
 * navigation, and no way back other than the browser's back button. Anyone who
 * followed a stale link — a bookmark from before a section moved, or a
 * notification pointing at a route that has since been renamed — landed there.
 *
 * Both exits are offered because a 404 cannot know who is reading it. An
 * ambassador and an admin have different homes, and guessing wrong sends
 * somebody to a screen that redirects them straight back.
 */
export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-white px-5 py-16">
      <div className="w-full max-w-md text-center">
        <Wordmark
          label="DailyMattr"
          className="mx-auto h-[18px] w-auto text-brand"
        />

        <div className="mt-8 grid size-14 place-items-center justify-self-center rounded-full bg-brand-tint text-brand-strong">
          <Compass className="size-6" />
        </div>

        <h1 className="display mt-5 text-[30px] leading-none text-gray-900">
          That page has moved
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed font-medium text-gray-500">
          The link you followed doesn&apos;t point anywhere any more. A few
          sections were regrouped, so an old bookmark can land here.
        </p>

        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/dashboard">Ambassador home</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/admin">Admin home</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
