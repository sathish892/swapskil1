import { createPublicKey, verify as verifySignature } from "node:crypto";

const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
let cachedKeys = null;
let keysExpireAt = 0;

function decodeJsonPart(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

async function fetchGoogleKeys(force = false) {
  if (!force && cachedKeys && Date.now() < keysExpireAt) return cachedKeys;
  const response = await fetch(GOOGLE_CERTS_URL, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("Google verification keys are unavailable.");
  const payload = await response.json();
  if (!Array.isArray(payload.keys)) throw new Error("Google verification keys are invalid.");
  const cacheControl = response.headers.get("cache-control") || "";
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/i)?.[1] || 300);
  cachedKeys = payload.keys;
  keysExpireAt = Date.now() + Math.max(60, Math.min(maxAge, 3600)) * 1000;
  return cachedKeys;
}

async function getSigningKey(keyId) {
  let keys = await fetchGoogleKeys();
  let signingKey = keys.find((key) => key.kid === keyId && key.kty === "RSA" && key.use === "sig");
  if (!signingKey) {
    // Google rotates signing keys; an unknown key id forces one immediate refresh.
    keys = await fetchGoogleKeys(true);
    signingKey = keys.find((key) => key.kid === keyId && key.kty === "RSA" && key.use === "sig");
  }
  if (!signingKey) throw new Error("Google token signing key was not found.");
  return createPublicKey({ key: signingKey, format: "jwk" });
}

/** Verify a Google Identity Services ID token using Google's rotating public keys. */
export async function verifyGoogleCredential(credential, expectedClientId) {
  if (typeof credential !== "string" || credential.length > 10_000 || !expectedClientId) {
    throw new Error("Google credential is missing or invalid.");
  }
  const parts = credential.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error("Google credential is malformed.");

  const header = decodeJsonPart(parts[0]);
  const claims = decodeJsonPart(parts[1]);
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("Google credential algorithm is invalid.");
  const key = await getSigningKey(header.kid);
  const validSignature = verifySignature(
    "RSA-SHA256",
    Buffer.from(`${parts[0]}.${parts[1]}`),
    key,
    Buffer.from(parts[2], "base64url"),
  );
  if (!validSignature) throw new Error("Google credential signature is invalid.");

  const nowSeconds = Math.floor(Date.now() / 1000);
  const audienceMatches = claims.aud === expectedClientId || Array.isArray(claims.aud) && claims.aud.includes(expectedClientId);
  const authorizedPartyMatches = !claims.azp || claims.azp === expectedClientId;
  if (!audienceMatches || !authorizedPartyMatches) throw new Error("Google credential was issued for a different application.");
  if (!(["accounts.google.com", "https://accounts.google.com"].includes(claims.iss))) throw new Error("Google credential issuer is invalid.");
  if (!Number.isFinite(claims.exp) || claims.exp <= nowSeconds) throw new Error("Google credential has expired.");
  if (!Number.isFinite(claims.iat) || claims.iat > nowSeconds + 60) throw new Error("Google credential issue time is invalid.");
  if (typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 255) throw new Error("Google account identifier is invalid.");
  if (typeof claims.email !== "string" || claims.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email)) throw new Error("Google email is invalid.");
  if (claims.email_verified !== true && claims.email_verified !== "true") throw new Error("Verify your Google email before signing in.");

  const fullName = typeof claims.name === "string" ? claims.name.trim().replace(/\s+/g, " ").slice(0, 100) : "";
  return {
    subject: claims.sub,
    email: claims.email.trim().toLowerCase(),
    fullName: fullName || claims.email.split("@")[0].slice(0, 100),
    emailVerified: true,
    hostedDomain: typeof claims.hd === "string" ? claims.hd.toLowerCase() : "",
  };
}
