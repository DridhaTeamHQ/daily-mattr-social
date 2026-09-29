import "server-only";

import { isLinkPreviewBot } from "@/lib/referral-click";
import { getSiteUrl } from "@/lib/site-url";
import { getAppStoreUrl, getPlayStoreUrl } from "@/lib/store-links";

/**
 * What every download link answers with: `dailymattr.app/download`, and each
 * ambassador's own `dailymattr.app/DMB18`.
 *
 * Works for whoever opens it, not whoever sent it. An Android student can post
 * it in a group and the iPhone in that group still lands on the App Store,
 * because the decision is made from the device doing the opening.
 *
 * iPhone, iPad and Mac go to the App Store; Android, Windows and everything
 * else (Linux, ChromeOS) go to Google Play. iPadOS says "Macintosh", which is
 * why the Mac goes to the App Store too — the two cannot be told apart from
 * the header, and do not need to be.
 *
 * ─── Why a server redirect, not a page with a script ───────────────────────
 *
 * This briefly was a page that redirected with `location.replace`, and it
 * broke every iPhone. On iOS, apps.apple.com hands straight off to the App
 * Store app through an `itms-apps` link, and Safari only lets that happen
 * after a tap or a server redirect — a script-driven one is dropped silently,
 * leaving the phone on "Opening…". A 302 is what the original `/r/<code>` did
 * and what iOS expects. Android never minded either way.
 *
 * A redirect cannot loop: it only ever points off-site, at a store, and a 302
 * is not left in history, so back from the store goes to wherever the link
 * was tapped.
 *
 * ─── The page, for link-preview crawlers ────────────────────────────────────
 *
 * WhatsApp, Telegram and the rest fetch the link to draw a preview card, and
 * a crawler that followed a redirect would describe the store listing instead
 * of the referral. So they alone get a page with the card's tags — and it
 * carries tappable store buttons, in case a real person is ever mistaken for
 * one.
 *
 * Store URLs come from `store-links`, the one place they are set, so a
 * corrected listing applies here with no deploy.
 */
export async function downloadResponse(
  request: Request,
  /** The referral code in the link, named in its preview card. */
  code?: string,
): Promise<Response> {
  const userAgent = request.headers.get("user-agent") ?? "";

  if (!isLinkPreviewBot(userAgent)) {
    const destination = /iPhone|iPad|iPod|Macintosh|Mac OS X/i.test(userAgent)
      ? await getAppStoreUrl()
      : await getPlayStoreUrl();

    return new Response(null, {
      status: 302,
      headers: { location: destination, "cache-control": "no-store" },
    });
  }

  const [playStoreUrl, appStoreUrl, siteUrl] = await Promise.all([
    getPlayStoreUrl(),
    getAppStoreUrl(),
    getSiteUrl(),
  ]);

  return new Response(page({ playStoreUrl, appStoreUrl, siteUrl, code }), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/** For attributes and text. The URLs come from a settings row, not from us. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}


function page({
  playStoreUrl,
  appStoreUrl,
  siteUrl,
  code,
}: {
  playStoreUrl: string;
  appStoreUrl: string;
  siteUrl: string;
  code?: string;
}): string {
  // The preview card a chat app draws under the link. It names the code, so
  // even a friend who skims the message sees it.
  const preview = code
    ? `Use my referral code ${code} after you install — on iPhone and Android.`
    : "Get the app on iPhone and Android.";
  const link =
    "display:block;margin:10px 0;padding:12px 18px;border-radius:12px;background:#111827;color:#fff;font-weight:700;text-decoration:none";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Get dailymattr</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="dailymattr">
<meta property="og:title" content="Get dailymattr">
<meta property="og:description" content="${escapeHtml(preview)}">
<meta property="og:image" content="${escapeHtml(`${siteUrl}/icon-512.png`)}">
<meta name="twitter:card" content="summary">
</head>
<body style="margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#6b7280;background:#fafafa">
<div style="text-align:center;padding:24px">
<p style="color:#111827;font-weight:800;font-size:18px">Get dailymattr</p>
<a style="${link}" href="${escapeHtml(appStoreUrl)}">App Store</a>
<a style="${link}" href="${escapeHtml(playStoreUrl)}">Google Play</a>
</div>
</body>
</html>`;
}
