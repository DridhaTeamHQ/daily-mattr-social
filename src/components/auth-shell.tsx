import Link from "next/link";

import { Wordmark } from "@/components/logo";

/**
 * The frame every auth screen sits in.
 *
 * Sign-in, forgot-password and reset-password are the same moment for the
 * person using them, so they get the same page: same width, same logo size,
 * same distance from the top. Rebuilding that layout per page is how three
 * screens end up subtly different from each other.
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-white px-5 py-12">
      <div className="w-full max-w-[22rem]">
        <Link href="/login" className="block">
          <Wordmark
            label="dailymattr"
            className="mx-auto mb-8 h-[30px] w-auto text-brand"
          />
        </Link>

        <h1 className="display text-[30px] leading-none text-ink">{title}</h1>
        <p className="mt-2.5 text-[14px] leading-relaxed font-medium text-ink-soft">
          {description}
        </p>

        <div className="mt-7">{children}</div>

        {footer && (
          <div className="mt-8 border-t border-gray-200 pt-5 text-[12.5px] leading-relaxed font-medium text-ink-soft">
            {footer}
          </div>
        )}
      </div>
    </main>
  );
}
