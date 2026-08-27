import { Smartphone } from "lucide-react";

import { Wordmark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { getTextSetting } from "@/lib/settings";

export const metadata = { title: "Android only for now" };

/**
 * Where `/r/[code]` sends an iPhone.
 *
 * The referral link used to point iOS at an App Store listing that does not
 * exist yet, so a student sharing their link handed a friend a 404 — and the
 * click was still counted as a referral that was never winnable.
 *
 * This is the honest version. It is addressed to the friend who tapped the
 * link, not to the ambassador who shared it: they arrived expecting an app,
 * and what they need is to know it is coming and that the code they were given
 * still means something when it does.
 *
 * The Play Store link is offered anyway, because "iPhone" is a guess made from
 * a user-agent string and the one thing worse than a dead end is a dead end
 * shown to somebody holding an Android phone.
 */
export default async function AndroidOnlyPage() {
  const playUrl = await getTextSetting(
    "play_store_url",
    "https://play.google.com/store/apps/details?id=com.dailymattr",
  );

  return (
    <main className="grid min-h-dvh place-items-center bg-white px-5 py-16">
      <div className="w-full max-w-md text-center">
        <Wordmark
          label="DailyMattr"
          className="mx-auto h-[28px] w-auto text-brand"
        />

        <div className="mt-8 grid size-14 place-items-center justify-self-center rounded-full bg-brand-tint text-brand-strong">
          <Smartphone className="size-6" />
        </div>

        <h1 className="display mt-5 text-[30px] leading-none text-gray-900">
          Android only, for now
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed font-medium text-gray-500">
          DailyMattr isn&apos;t on the App Store yet. If you&apos;re on an
          Android phone you can install it today — and hold on to the referral
          code you were given either way, it still counts when the iPhone
          version lands.
        </p>

        <div className="mt-7 flex justify-center">
          <Button asChild>
            {/* rel on an outbound link the same way the rest of the app does
                it: the store does not need to know which page sent the tap. */}
            <a href={playUrl} target="_blank" rel="noopener noreferrer">
              Open the Play Store
            </a>
          </Button>
        </div>
      </div>
    </main>
  );
}
