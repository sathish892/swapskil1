export type PublicUser = {
  id: string;
  fullName: string;
  email: string;
  role: "user" | "admin";
  createdAt: string;
};

export type ApiError = {
  error?: string;
  errors?: Record<string, string>;
};

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function getSafeReturnPath() {
  const requested = new URLSearchParams(window.location.search).get("redirect");
  if (
    requested &&
    requested.startsWith("/") &&
    !requested.startsWith("//") &&
    !requested.startsWith("/\\") &&
    !requested.startsWith("/login") &&
    !requested.startsWith("/register")
  ) {
    return requested;
  }
  return "/account";
}

export function responseError(payload: ApiError, fallback: string) {
  return typeof payload.error === "string" && payload.error ? payload.error : fallback;
}
