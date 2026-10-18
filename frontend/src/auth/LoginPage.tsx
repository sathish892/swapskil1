import { useState, type FormEvent } from "react";
import { AuthField } from "./AuthField";
import { AuthShell } from "./AuthShell";
import { EMAIL_PATTERN, getSafeReturnPath, responseError, type ApiError, type PublicUser } from "./types";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<"email" | "password", string>>>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Partial<Record<"email" | "password", string>> = {};
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) nextErrors.email = "Enter your email address.";
    else if (normalizedEmail.length > 254 || !EMAIL_PATTERN.test(normalizedEmail)) nextErrors.email = "Enter a valid email address.";
    if (!password) nextErrors.password = "Enter your password.";
    else if (Array.from(password).length > 128) nextErrors.password = "Use 128 characters or fewer.";
    setErrors(nextErrors);
    setFormError("");
    if (Object.keys(nextErrors).length) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });
      const payload = await response.json() as ApiError & { user?: PublicUser };
      if (!response.ok) {
        setErrors(payload.errors ?? {});
        setFormError(responseError(payload, "We couldn’t sign you in. Please try again."));
        return;
      }
      if (!payload.user || typeof payload.user !== "object" || !["admin", "user"].includes(payload.user.role)) {
        setFormError("We couldn’t confirm your sign-in. Please try again.");
        return;
      }
      window.location.replace(payload.user.role === "admin" ? "/admin" : getSafeReturnPath());
    } catch {
      setFormError("Couldn’t connect to SkillSwap. Check that the server is running, then try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell eyebrow="Welcome back" title="Pick up where curiosity left off." description="Sign in to continue learning and sharing with fellow students.">
      <form onSubmit={submit} noValidate className="space-y-5">
        {formError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">{formError}</p>}
        <AuthField id="email" label="Email address" type="email" autoComplete="email" value={email} onChange={setEmail} error={errors.email} maxLength={254} />
        <AuthField
          id="password"
          label="Password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          error={errors.password}
          maxLength={128}
          endAction={(
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((shown) => !shown)}
              className="rounded-md px-2 py-1 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          )}
        />
        <button
          type="submit"
          disabled={submitting}
          className="mt-2 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-forest px-6 text-sm font-semibold text-white transition-colors hover:bg-emerald-950 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-wait disabled:opacity-65"
        >
          {submitting ? "Signing in…" : "Log in"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">
        New to SkillSwap? <a href="/register" className="rounded-sm font-semibold text-emerald-800 underline decoration-emerald-800/30 underline-offset-4 transition-colors hover:text-emerald-950 hover:decoration-emerald-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">Create an account</a>
      </p>
    </AuthShell>
  );
}
