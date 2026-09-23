/**
 * A user-agent string as the two words an admin reads it for.
 *
 * Not a parser. The raw header is three hundred characters of version
 * numbers, and the question it answers on a responses page is only "are
 * these four submissions the same phone": "Android · Instagram" four times in
 * a row answers it. Anything unrecognised falls through to "Other" rather
 * than guessing.
 */
export function describeDevice(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const ua = userAgent;

  const os = /iPhone|iPad|iPod/.test(ua)
    ? "iPhone"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Macintosh|Mac OS X/.test(ua)
          ? "Mac"
          : /Linux/.test(ua)
            ? "Linux"
            : "Other";

  // In-app browsers first: they also claim to be Chrome or Safari, and
  // "opened from Instagram" is the more useful fact about where a link went.
  const browser = /Instagram/.test(ua)
    ? "Instagram"
    : /FBAN|FBAV|FB_IAB/.test(ua)
      ? "Facebook"
      : /WhatsApp/.test(ua)
        ? "WhatsApp"
        : /Snapchat/.test(ua)
          ? "Snapchat"
          : /Edg\//.test(ua)
            ? "Edge"
            : /SamsungBrowser/.test(ua)
              ? "Samsung"
              : /OPR\/|Opera/.test(ua)
                ? "Opera"
                : /Firefox|FxiOS/.test(ua)
                  ? "Firefox"
                  : /Chrome|CriOS/.test(ua)
                    ? "Chrome"
                    : /Safari/.test(ua)
                      ? "Safari"
                      : null;

  return browser ? `${os} · ${browser}` : os;
}
