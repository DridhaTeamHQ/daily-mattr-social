import "server-only";

import { getSiteUrl } from "@/lib/site-url";
import { getAppStoreUrl, getPlayStoreUrl } from "@/lib/store-links";

/**
 * The page behind every download link: `dailymattr.app/download`, and each
 * ambassador's own `dailymattr.app/DMB18`.
 *
 * Works for whoever opens it, not whoever sent it. An Android student can post
 * it in a group and the iPhone in that group still lands on the App Store,
 * because the decision is made on the phone doing the opening.
 *
 * ─── Why a page with a script, not a server redirect ───────────────────────
 *
 * iPadOS 13 and later sends a desktop Mac user agent, so a server reading the
 * header sees a laptop. Only the browser can tell the two apart, by asking
 * whether the "Mac" has a touch screen. Deciding in the page is what keeps
 * iPads out of the desktop fallback.
 *
 * ─── Why it can never loop ──────────────────────────────────────────────────
 *
 * It only ever sends people off-site, to a store, and with
 * `location.replace`, so this page is not left in history. Back from the store
 * goes to wherever the link was tapped, not here and out to the store again.
 * Nothing on this page points back at itself.
 *
 * Computers go by maker: a Mac gets the App Store listing, Windows and
 * everything else (Linux, ChromeOS) get Google Play. Checked by the user
 * agent, after the iPad test, because an iPad also says "Macintosh".
 * Without JavaScript, the `<noscript>` links are the whole page.
 *
 * Store URLs come from `store-links`, the one place they are set, so a
 * corrected listing applies here with no deploy.
 */
export async function downloadPageResponse(
  /** The referral code in the link, named in its preview card. */
  code?: string,
): Promise<Response> {
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

/** A JSON string that cannot close the `<script>` it sits in. */
function jsString(value: string): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
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
  // The preview card a chat app draws under the link. A share from a laptop
  // goes out as text alone, so this card is the only picture it gets — and
  // it names the code, so even a friend who skims the message sees it.
  // Crawlers do not run the script below, so they stay here and read these.
  const preview = code
    ? `Use my referral code ${code} after you install — on iPhone and Android.`
    : "Get the app on iPhone and Android.";
  const config = `{"ios":${jsString(appStoreUrl)},"android":${jsString(playStoreUrl)},"fallback":""}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Opening Dailymattr…</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="dailymattr">
<meta property="og:title" content="Get dailymattr">
<meta property="og:description" content="${escapeHtml(preview)}">
<meta property="og:image" content="${escapeHtml(`${siteUrl}/icon-512.png`)}">
<meta name="twitter:card" content="summary">
</head>
<body style="margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#6b7280;background:#fafafa">
<p>Opening Dailymattr…</p>
<script>
(function(){
  var c=${config};
  var ua=navigator.userAgent||"";
  var isIOS=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
  var isAndroid=/Android/.test(ua);
  var isMac=!isIOS&&/Macintosh|Mac OS X/.test(ua);
  var dest=c.fallback||c.android||c.ios;
  if((isIOS||isMac)&&c.ios){dest=c.ios;}
  else if(isAndroid&&c.android){dest=c.android;}
  window.location.replace(dest);
})();
</script>
<noscript><p>Choose your platform: <a href="${escapeHtml(appStoreUrl)}">App Store</a> &#183; <a href="${escapeHtml(playStoreUrl)}">Google Play</a></p></noscript>
</body>
</html>`;
}
