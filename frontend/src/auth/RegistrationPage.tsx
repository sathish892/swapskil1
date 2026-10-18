import { useState } from "react";
import { AuthShell } from "./AuthShell";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { getSafeReturnPath, responseError, type ApiError, type PublicUser } from "./types";

export function RegistrationPage() {
  const [formError, setFormError] = useState("");
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  const signUpWithGoogle = async (credential: string) => {
    setGoogleSubmitting(true);
    setFormError("");
    try {
      const response = await fetch("/api/auth/google", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      const payload = await response.json() as ApiError & { user?: PublicUser };
      if (!response.ok) {
        setFormError(responseError(payload, "We couldn’t create your account with Google. Please try again."));
        return;
      }
      if (!payload.user || !["admin", "user"].includes(payload.user.role)) {
        setFormError("We couldn’t confirm your Google account. Please try again.");
        return;
      }
      window.location.replace(payload.user.role === "admin" ? "/admin" : getSafeReturnPath());
    } catch {
      setFormError("Couldn’t connect to SkillSwap. Check your connection and try again.");
    } finally {
      setGoogleSubmitting(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Start with what you know"
      title="Make room for a new skill."
      description="Create your SkillSwap account securely with Google and start learning from one another."
    >
      {formError && <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">{formError}</p>}
      <GoogleSignInButton onCredential={signUpWithGoogle} onError={setFormError} pending={googleSubmitting} />
      <p className="mt-5 text-center text-sm text-slate-500">Already have a SkillSwap account? Continue with the same Google account.</p>
    </AuthShell>
  );
}
