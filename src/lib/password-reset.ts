"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv, serverEnv } from "@/lib/env";
import { getSiteUrl } from "@/lib/site-url";

/**
 * "Forgot password", without Supabase SMTP.
 *
 * Supabase's own `resetPasswordForEmail` needs an SMTP server configured on the
 * project, which this programme deliberately does not have — the whole account
 * model was built around an admin handing out a temporary password precisely to
 * avoid that dependency. Now that Brevo is wired up for welcome emails, the
 * same channel can carry a reset.
 *
 * The link points at OUR route with a `token_hash`, not at Supabase's verify
 * endpoint. That keeps the whole exchange server-side: the route verifies the
 * hash and sets the session cookie, so no access token ever lands in a URL
 * fragment for the browser to handle.
 */

export type ResetRequestState = { ok: boolean; message: string } | null;

export async function requestPasswordReset(
  _prev: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  // Deliberately identical whatever happens next. Different wording for a
  // known and an unknown address turns this form into a way to find out who
  // has an account.
  const sameAnswer = {
    ok: true,
    message:
      "If that address has an account, a reset link is on its way. It expires in an hour.",
  };

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: "That doesn't look like an email address." };
  }

  const env = serverEnv();
  if (!env.brevoApiKey || !env.brevoSenderEmail) {
    return {
      ok: false,
      message:
        "Password reset email isn't configured. Ask an admin to reset it for you.",
    };
  }

  try {
    const db = createAdminClient();

    const { data, error } = await db.auth.admin.generateLink({
      type: "recovery",
      email,
    });

    // An unknown address errors here. Swallowed on purpose — see above.
    if (error || !data?.properties?.hashed_token) return sameAnswer;

    const siteUrl = await getSiteUrl();
    const link = `${siteUrl}/auth/recover?token_hash=${encodeURIComponent(
      data.properties.hashed_token,
    )}`;

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "api-key": env.brevoApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: env.brevoSenderName, email: env.brevoSenderEmail },
        to: [{ email }],
        subject: "Reset your DailyMattr password",
        htmlContent: resetEmailHtml(link),
      }),
    });

    // Still the same answer. A Brevo outage must not become a way to probe
    // which addresses exist.
    if (!response.ok) return sameAnswer;

    return sameAnswer;
  } catch {
    return sameAnswer;
  }
}

function resetEmailHtml(link: string): string {
  const download = publicEnv.appDownloadUrl;

  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0a0a0a">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;padding:32px">
          <tr><td>
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#3979ff">DailyMattr</p>
            <h1 style="margin:0 0 12px;font-size:24px;line-height:1.2">Reset your password</h1>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b4b4b">
              Click the button below to choose a new password. The link works once and expires in an hour.
            </p>
            <p style="margin:0 0 24px">
              <a href="${link}" style="display:inline-block;background:#2d67e8;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:10px">Choose a new password</a>
            </p>
            <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#8a8a8a">
              If the button doesn't work, paste this into your browser:
            </p>
            <p style="margin:0 0 24px;font-size:12px;line-height:1.5;word-break:break-all;color:#8a8a8a">${link}</p>
            <p style="margin:0;font-size:13px;line-height:1.6;color:#4b4b4b">
              Didn't ask for this? Ignore this email — your password stays as it is.
            </p>
            ${
              download
                ? `<p style="margin:24px 0 0;font-size:13px;color:#8a8a8a">Get the app: <a href="${download}" style="color:#2d67e8">${download}</a></p>`
                : ""
            }
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}
