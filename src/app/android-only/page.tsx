import { redirect } from "next/navigation";

import { getAppStoreUrl } from "@/lib/store-links";

// Read per request, so a corrected `app_store_url` setting applies without a
// build baking the old one in.
export const dynamic = "force-dynamic";

/**
 * Where `/r/[code]` used to send an iPhone while there was no iOS build.
 *
 * The app is in the App Store now and the referral redirect goes there
 * directly, but this address was handed out in the meantime — straight to the
 * listing rather than a "coming soon" that is no longer true.
 */
export default async function AndroidOnlyPage() {
  redirect(await getAppStoreUrl());
}
