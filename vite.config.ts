import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load VITE_API_URL from .env.local / .env / etc. so the dev-server proxy
  // and the app's runtime API client point at the same backend. Single source
  // of truth lives in .env.local.
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget =
    env.VITE_API_URL ??
    "https://centrion-backend-gbe4a7a7d2h5dkde.canadacentral-01.azurewebsites.net";

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
  };
});
