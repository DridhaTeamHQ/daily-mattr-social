/**
 * "Sign in with Google" on the public survey page — LOCAL ONLY for now.
 *
 * On when `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is set (in `.env.local`, which is
 * gitignored) AND the app is not a production build. The second check is the
 * one that matters: even if the variable ever reaches Vercel, a production
 * build compiles this to `null` and the survey page, the server action and the
 * CSP are exactly what they were before. Delete the NODE_ENV check to ship it.
 *
 * Read literally so Next inlines both values into the client bundle.
 */
export function googleSignInClientId(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || null;
}
