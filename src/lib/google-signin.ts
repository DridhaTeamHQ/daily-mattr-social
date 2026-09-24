/**
 * "Sign in with Google" on the public survey page.
 *
 * On wherever `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is set — `.env.local` locally,
 * the Vercel project settings in production. Unset, the survey page, the
 * server action and the CSP are what they were before: typed name and email,
 * and the IP window for duplicates.
 *
 * Read literally so Next inlines it into the client bundle. That also means it
 * is fixed at build time: changing it on Vercel needs a redeploy.
 */
export function googleSignInClientId(): string | null {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || null;
}
