import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const frontendDirectory = dirname(fileURLToPath(import.meta.url));
  const certificatePath = resolve(frontendDirectory, ".certs/dev-server-cert.pem");
  const keyPath = resolve(frontendDirectory, ".certs/dev-server-key.pem");
  const https = existsSync(certificatePath) && existsSync(keyPath)
    ? { cert: readFileSync(certificatePath), key: readFileSync(keyPath) }
    : undefined;

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: "0.0.0.0",
      https,
      proxy: {
        "/api": {
          target: env.API_PROXY_TARGET || "http://127.0.0.1:3000",
          changeOrigin: true,
          ws: true,
        },
      },
    },
  };
});
