"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";

type GoogleId = {
  initialize: (config: {
    client_id: string;
    callback: (response: { credential: string }) => void;
    auto_select?: boolean;
  }) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
  disableAutoSelect: () => void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

function loadScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("gsi")), { once: true });
  });
}

/** Display-only. The server re-verifies the token with Google before trusting any of it. */
function readClaims(credential: string): { email?: string; name?: string } {
  try {
    const part = credential.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(part)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
    return JSON.parse(json);
  } catch {
    return {};
  }
}

/**
 * Replaces the typed email on the public survey when Google sign-in is on
 * (local only — see lib/google-signin). The ID token rides along in a hidden
 * field and the server action checks it.
 */
export function GoogleSignIn({
  clientId,
  onSignedIn,
}: {
  clientId: string;
  /** Told the ID token whenever the person signs in, or "" when they click Change. */
  onSignedIn?: (credential: string) => void;
}) {
  const buttonRef = React.useRef<HTMLDivElement>(null);
  const [credential, setCredential] = React.useState("");

  // A ref, so the Google callback registered once below always calls the latest one.
  const onSignedInRef = React.useRef(onSignedIn);
  React.useEffect(() => {
    onSignedInRef.current = onSignedIn;
  });
  React.useEffect(() => {
    onSignedInRef.current?.(credential);
  }, [credential]);
  const [failed, setFailed] = React.useState(false);
  const claims = credential ? readClaims(credential) : null;

  React.useEffect(() => {
    if (credential) return;
    let cancelled = false;

    loadScript()
      .then(() => {
        const id = window.google?.accounts.id;
        if (cancelled || !id || !buttonRef.current) return;
        id.initialize({
          client_id: clientId,
          callback: (response) => setCredential(response.credential),
        });
        id.renderButton(buttonRef.current, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "pill",
          width: 280,
        });
      })
      .catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
    };
  }, [clientId, credential]);

  return (
    <div>
      <input type="hidden" name="google_credential" value={credential} />

      {claims ? (
        // Keyed so React never reuses the button's <div> for this card: Google
        // writes its own nodes into that one, and they would come along.
        <div key="signed-in" className="brut-sm flex items-center justify-between gap-3 rounded-xl bg-surface px-3.5 py-2.5">
          <div className="min-w-0 text-[13.5px]">
            <p className="text-ink-soft">Signed in as</p>
            {claims.name && <p className="truncate font-bold text-ink">{claims.name}</p>}
            <p className="truncate text-ink-soft">{claims.email}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              window.google?.accounts.id.disableAutoSelect();
              setCredential("");
            }}
          >
            Change
          </Button>
        </div>
      ) : (
        <div key="button" ref={buttonRef} className="min-h-11" />
      )}

      {failed && (
        <p className="mt-1.5 text-[12.5px] text-bad">
          Couldn&apos;t load Google sign-in. Check your connection and reload.
        </p>
      )}
    </div>
  );
}
