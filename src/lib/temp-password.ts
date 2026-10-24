/**
 * How long an admin-issued temporary password works (0059).
 *
 * Plain module, no server-only import: the server writes the expiry and
 * checks it at sign-in, and the admin list reads it to show "Login expired".
 */

export const TEMP_PASSWORD_DAYS = 5;

/** The expiry to store alongside a temporary password issued right now. */
export function tempPasswordExpiry(from: Date = new Date()): string {
  return new Date(
    from.getTime() + TEMP_PASSWORD_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
}

/**
 * Whether this profile is stuck on a temporary password that has run out.
 *
 * Only ever true while they still have to change it: once they choose their
 * own, the expiry is cleared and nothing here applies.
 */
export function isTempPasswordExpired(
  profile: {
    must_change_password: boolean;
    temp_password_expires_at: string | null;
  },
  now: Date = new Date(),
): boolean {
  return (
    profile.must_change_password &&
    profile.temp_password_expires_at !== null &&
    new Date(profile.temp_password_expires_at).getTime() <= now.getTime()
  );
}
