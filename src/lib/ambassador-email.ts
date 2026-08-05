import "server-only";

import { publicEnv, serverEnv } from "@/lib/env";
import { getSiteUrl } from "@/lib/site-url";

type WelcomeEmailInput = {
  email: string;
  fullName: string;
  password: string;
};

export type WelcomeEmailResult =
  | { ok: true; message: string }
  | { ok: false; reason: "disabled" | "failed"; message: string };

export async function sendAmbassadorWelcomeEmail(
  input: WelcomeEmailInput,
): Promise<WelcomeEmailResult> {
  const env = serverEnv();
  const apiKey = env.brevoApiKey;
  const senderEmail = env.brevoSenderEmail;
  const senderName = env.brevoSenderName;
  const appDownloadUrl = publicEnv.appDownloadUrl;

  if (!apiKey || !senderEmail || !appDownloadUrl) {
    return {
      ok: false,
      reason: "disabled",
      message: "Account created, but welcome email is not configured yet.",
    };
  }

  const siteUrl = await getSiteUrl();
  const loginUrl = `${siteUrl}/login`;

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: {
        name: senderName,
        email: senderEmail,
      },
      to: [
        {
          email: input.email,
          name: input.fullName,
        },
      ],
      subject: "Your DailyMattr ambassador account is ready",
      htmlContent: welcomeEmailHtml({
        fullName: input.fullName,
        email: input.email,
        password: input.password,
        loginUrl,
        appDownloadUrl,
      }),
      textContent: welcomeEmailText({
        fullName: input.fullName,
        email: input.email,
        password: input.password,
        loginUrl,
        appDownloadUrl,
      }),
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Failed to send ambassador welcome email via Brevo", detail);
    return {
      ok: false,
      reason: "failed",
      message: "Account created, but the welcome email could not be sent.",
    };
  }

  return { ok: true, message: "Welcome email sent." };
}

function welcomeEmailHtml(input: {
  fullName: string;
  email: string;
  password: string;
  loginUrl: string;
  appDownloadUrl: string;
}) {
  return `
    <div style="margin:0;background:#f4f8ff;padding:32px 16px;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;">
      <div style="max-width:640px;margin:0 auto;overflow:hidden;border:1px solid #bfdbfe;border-radius:24px;background:#ffffff;box-shadow:0 14px 40px rgba(37,99,235,0.12);">
        <div style="background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);padding:28px 32px;color:#ffffff;">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;opacity:0.92;">DailyMattr</div>
          <h1 style="margin:12px 0 0;font-size:30px;line-height:1.1;font-weight:800;">Your ambassador login is ready</h1>
          <p style="margin:12px 0 0;font-size:15px;line-height:1.7;color:#dbeafe;">
            Welcome aboard, ${escapeHtml(input.fullName)}. Use the credentials below to sign in and get started.
          </p>
        </div>
        <div style="padding:32px;">
          <div style="margin-bottom:24px;border:1px solid #dbeafe;border-radius:20px;background:#eff6ff;padding:20px 22px;">
            <div style="font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#1d4ed8;">Login credentials</div>
            <div style="margin-top:14px;">
              <div style="font-size:13px;font-weight:700;color:#475569;">Email</div>
              <div style="margin-top:4px;font-size:16px;font-weight:700;color:#0f172a;word-break:break-word;">${escapeHtml(input.email)}</div>
            </div>
            <div style="margin-top:16px;">
              <div style="font-size:13px;font-weight:700;color:#475569;">Temporary password</div>
              <div style="margin-top:4px;font-size:18px;font-weight:800;color:#0f172a;letter-spacing:0.04em;">${escapeHtml(input.password)}</div>
            </div>
          </div>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#334155;">
            Sign in on the website first. You will be asked to change this temporary password right away.
          </p>
          <div style="margin:24px 0 28px;">
            <a href="${escapeHtml(input.loginUrl)}" style="display:inline-block;margin-right:12px;margin-bottom:12px;border-radius:999px;background:#2563eb;padding:14px 22px;font-size:14px;font-weight:800;color:#ffffff;text-decoration:none;">
              Login to DailyMattr
            </a>
            <a href="${escapeHtml(input.appDownloadUrl)}" style="display:inline-block;margin-bottom:12px;border:1px solid #93c5fd;border-radius:999px;background:#ffffff;padding:14px 22px;font-size:14px;font-weight:800;color:#1d4ed8;text-decoration:none;">
              Download the app
            </a>
          </div>
          <div style="border-top:1px solid #dbeafe;padding-top:20px;">
            <div style="font-size:13px;font-weight:700;color:#1d4ed8;">Quick links</div>
            <p style="margin:10px 0 0;font-size:14px;line-height:1.7;color:#334155;">
              Website login: <a href="${escapeHtml(input.loginUrl)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(input.loginUrl)}</a><br />
              App download: <a href="${escapeHtml(input.appDownloadUrl)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(input.appDownloadUrl)}</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function welcomeEmailText(input: {
  fullName: string;
  email: string;
  password: string;
  loginUrl: string;
  appDownloadUrl: string;
}) {
  return [
    `Hi ${input.fullName},`,
    "",
    "Your DailyMattr ambassador account is ready.",
    "",
    `Email: ${input.email}`,
    `Temporary password: ${input.password}`,
    "",
    `Website login: ${input.loginUrl}`,
    `App download: ${input.appDownloadUrl}`,
    "",
    "Sign in with the temporary password and you will be asked to change it immediately.",
  ].join("\n");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
