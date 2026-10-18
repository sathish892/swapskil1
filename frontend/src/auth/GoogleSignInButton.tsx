import { useEffect, useRef, useState } from "react";

type CredentialResponse = { credential?: string };

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; callback: (response: CredentialResponse) => void; ux_mode: "popup"; cancel_on_tap_outside: boolean }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, string | number | boolean>) => void;
        };
      };
    };
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || "";
const GOOGLE_SCRIPT_URL = "https://accounts.google.com/gsi/client";

export function GoogleSignInButton({ onCredential, onError, pending = false }: {
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
  pending?: boolean;
}) {
  const buttonHost = useRef<HTMLDivElement>(null);
  const credentialHandler = useRef(onCredential);
  const [scriptError, setScriptError] = useState("");
  credentialHandler.current = onCredential;

  useEffect(() => {
    const host = buttonHost.current;
    if (!host || !CLIENT_ID) return;
    let active = true;
    let script: HTMLScriptElement | null = null;

    const render = () => {
      const googleIdentity = window.google?.accounts.id;
      if (!active || !host || !googleIdentity) return;
      try {
        googleIdentity.initialize({
          client_id: CLIENT_ID,
          ux_mode: "popup",
          cancel_on_tap_outside: true,
          callback: (response) => {
            if (response.credential) credentialHandler.current(response.credential);
            else onError("Google did not return a sign-in credential. Please try again.");
          },
        });
        host.replaceChildren();
        googleIdentity.renderButton(host, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "pill",
          logo_alignment: "center",
          width: Math.min(Math.max(host.clientWidth, 280), 420),
        });
        setScriptError("");
      } catch {
        setScriptError("Google sign-in could not be loaded. Refresh the page and try again.");
      }
    };

    if (window.google?.accounts.id) {
      render();
    } else {
      script = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_SCRIPT_URL}"]`);
      if (!script) {
        script = document.createElement("script");
        script.src = GOOGLE_SCRIPT_URL;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
      const handleLoad = () => render();
      const handleError = () => { if (active) setScriptError("Couldn’t connect to Google sign-in. Check your connection and try again."); };
      script.addEventListener("load", handleLoad);
      script.addEventListener("error", handleError);
      if (script.dataset.loaded === "true") render();
      else script.addEventListener("load", () => { script!.dataset.loaded = "true"; }, { once: true });
      return () => {
        active = false;
        script?.removeEventListener("load", handleLoad);
        script?.removeEventListener("error", handleError);
      };
    }

    return () => { active = false; };
  }, [onError]);

  if (!CLIENT_ID) {
    return <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-xs leading-5 text-amber-900">Google sign-in needs setup. Add <code>VITE_GOOGLE_CLIENT_ID</code> to the Vercel frontend environment.</p>;
  }

  return <div className="space-y-2">
    <div className={`flex min-h-10 w-full justify-center overflow-hidden ${pending ? "pointer-events-none opacity-60" : ""}`} ref={buttonHost} aria-busy={pending} />
    {pending && <p className="text-center text-xs text-slate-500" role="status">Signing in with Google…</p>}
    {scriptError && <p className="text-center text-xs text-red-700" role="alert">{scriptError}</p>}
  </div>;
}
