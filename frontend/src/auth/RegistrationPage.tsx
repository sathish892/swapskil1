import { useState, type FormEvent } from "react";
import { AuthField } from "./AuthField";
import { AuthShell } from "./AuthShell";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { EMAIL_PATTERN, getSafeReturnPath, responseError, type ApiError, type PublicUser } from "./types";

type RegistrationErrors = Partial<Record<"fullName" | "email" | "password" | "confirmPassword", string>>;

export function RegistrationPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<RegistrationErrors>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
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

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: RegistrationErrors = {};
    const normalizedName = fullName.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedName) nextErrors.fullName = "Enter your full name.";
    else if (Array.from(normalizedName).length > 100) nextErrors.fullName = "Use 100 characters or fewer.";
    if (!normalizedEmail) nextErrors.email = "Enter your email address.";
    else if (normalizedEmail.length > 254 || !EMAIL_PATTERN.test(normalizedEmail)) nextErrors.email = "Enter a valid email address.";
    if (Array.from(password).length < 12) nextErrors.password = "Use at least 12 characters.";
    else if (Array.from(password).length > 128) nextErrors.password = "Use 128 characters or fewer.";
    if (!confirmPassword) nextErrors.confirmPassword = "Confirm your password.";
    else if (password !== confirmPassword) nextErrors.confirmPassword = "The passwords do not match.";

    setErrors(nextErrors);
    setFormError("");
    if (Object.keys(nextErrors).length) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: normalizedName, email: normalizedEmail, password, confirmPassword }),
      });
      const payload = await response.json() as ApiError & { user?: unknown };
      if (!response.ok) {
        setErrors(payload.errors ?? {});
        setFormError(responseError(payload, "We couldn’t create your account. Please try again."));
        return;
      }
      if (!payload.user || typeof payload.user !== "object") {
        setFormError("We couldn’t confirm your account. Please try again.");
        return;
      }
      window.location.replace(getSafeReturnPath());
    } catch {
      setFormError("Couldn’t connect to SkillSwap. Check that the server is running, then try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell eyebrow="Start with what you know" title="Make room for a new skill." description="Join a student community built around curiosity, practice, and learning from one another.">
      <form onSubmit={submit} noValidate className="space-y-5">
        {formError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">{formError}</p>}
        <AuthField id="fullName" label="Full name" autoComplete="name" value={fullName} onChange={setFullName} error={errors.fullName} maxLength={100} />
        <AuthField id="email" label="Email address" type="email" autoComplete="email" value={email} onChange={setEmail} error={errors.email} maxLength={254} />
        <AuthField id="password" label="Password" type={showPassword ? "text" : "password"} autoComplete="new-password" value={password} onChange={setPassword} error={errors.password} hint="Use 12–128 characters. A passphrase is fine." maxLength={128} endAction={<button type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword((shown) => !shown)} className="rounded-md px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-forest">{showPassword ? "Hide" : "Show"}</button>} />
        <AuthField id="confirmPassword" label="Confirm password" type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={setConfirmPassword} error={errors.confirmPassword} maxLength={128} endAction={<button type="button" aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"} aria-pressed={showConfirmPassword} onClick={() => setShowConfirmPassword((shown) => !shown)} className="rounded-md px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-forest">{showConfirmPassword ? "Hide" : "Show"}</button>} />
        <button
          type="submit"
          disabled={submitting}
          className="mt-2 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-forest px-6 text-sm font-semibold text-white transition-colors hover:bg-emerald-950 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-wait disabled:opacity-65"
        >
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>
      <div className="my-5 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-slate-200" /><span className="text-xs font-medium uppercase tracking-wide text-slate-500">or</span><span className="h-px flex-1 bg-slate-200" />
      </div>
      <GoogleSignInButton onCredential={signUpWithGoogle} onError={setFormError} pending={googleSubmitting || submitting} />
      <p className="mt-6 text-center text-sm text-slate-600">
        Already have an account? <a href="/login" className="rounded-sm font-semibold text-emerald-800 underline decoration-emerald-800/30 underline-offset-4 transition-colors hover:text-emerald-950 hover:decoration-emerald-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">Log in</a>
      </p>
    </AuthShell>
  );
}
