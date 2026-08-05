"use client";

import Link from "next/link";
import * as React from "react";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * The error boundary.
 *
 * Without one, a thrown error anywhere in the app renders Next's default
 * screen — which in production says nothing at all and offers no way out.
 *
 * The message is deliberately NOT shown. It can carry a Postgres error, a
 * column name or part of a query, and this page is reachable by students. The
 * digest is shown instead: it is meaningless to a reader but it is the string
 * that finds the real error in the server logs, which is exactly what someone
 * reporting the problem needs to be able to quote.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Goes to the server logs in production, and the browser console locally.
    console.error("Unhandled application error", error);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center bg-white px-5 py-16">
      <div className="w-full max-w-md text-center">
        <div className="grid size-14 place-items-center justify-self-center rounded-full bg-rose-50 text-rose-600">
          <TriangleAlert className="size-6" />
        </div>

        <h1 className="display mt-5 text-[28px] leading-none text-gray-900">
          Something broke
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed font-medium text-gray-500">
          This one is on us, not on anything you did. Trying again often works —
          it may have been a slow database call.
        </p>

        {error.digest && (
          <p className="mt-4 font-mono text-[12px] text-gray-400">
            Reference {error.digest}
          </p>
        )}

        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <Button onClick={reset}>Try again</Button>
          <Button variant="secondary" asChild>
            {/* The root route sends admins to /admin and everyone else to
                /dashboard, so this needs no idea who is reading it. */}
            <Link href="/">Start over</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
