import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  // "" prefix: also read non-VITE_ vars such as API_PROXY_TARGET (never sent to the browser)
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react(), tailwindcss()],
    server: {
      // Local only by default; Docker passes --host 0.0.0.0
      host: "localhost",
      port: 3000,
      strictPort: true,
      hmr: {
        port: 3000,
      },
      // Same-origin API in dev: no CORS, and the /api/v1/auth refresh cookie just works
      proxy: {
        "/api": env.API_PROXY_TARGET || "http://localhost:8000",
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
    },
  };
});
