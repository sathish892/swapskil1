const developmentFrontendPorts = new Set(["5173", "5174", "5175", "5176", "5177", "5178", "5179", "5180"]);

function isLocalOrPrivateIpv4(hostname) {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [first, second] = parts;
  return first === 10 || first === 127 || first === 192 && second === 168 || first === 172 && second >= 16 && second <= 31;
}

/** Permit only local/private-network Vite origins while running in development. */
export function isDevelopmentFrontendOrigin(origin) {
  if (process.env.NODE_ENV !== "development" || typeof origin !== "string") return false;
  let parsed;
  try { parsed = new URL(origin); } catch { return false; }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") return false;
  const port = parsed.port || "80";
  if (!developmentFrontendPorts.has(port)) return false;
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return hostname === "localhost" || hostname === "::1" || isLocalOrPrivateIpv4(hostname);
}
