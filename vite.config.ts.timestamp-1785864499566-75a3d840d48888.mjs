// vite.config.ts
import { defineConfig, loadEnv } from "file:///D:/Centrion_Frontend/node_modules/vite/dist/node/index.js";
import react from "file:///D:/Centrion_Frontend/node_modules/@vitejs/plugin-react-swc/index.js";
import path from "path";
import { componentTagger } from "file:///D:/Centrion_Frontend/node_modules/lovable-tagger/dist/index.js";
var __vite_injected_original_dirname = "D:\\Centrion_Frontend";
var vite_config_default = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_API_URL ?? "https://centrion-backend-gbe4a7a7d2h5dkde.canadacentral-01.azurewebsites.net";
  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false
      },
      // Allow this dev server to be reached through ngrok / Cloudflare / etc.
      // Vite's host check blocks unknown Host headers by default; the leading
      // dot is Vite syntax for "any subdomain of this base".
      allowedHosts: [
        "localhost",
        ".ngrok-free.dev",
        ".ngrok-free.app",
        ".ngrok.io",
        ".trycloudflare.com"
      ],
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true
        }
      }
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__vite_injected_original_dirname, "./src")
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"]
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxDZW50cmlvbl9Gcm9udGVuZFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiRDpcXFxcQ2VudHJpb25fRnJvbnRlbmRcXFxcdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0Q6L0NlbnRyaW9uX0Zyb250ZW5kL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnLCBsb2FkRW52IH0gZnJvbSBcInZpdGVcIjtcclxuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdC1zd2NcIjtcclxuaW1wb3J0IHBhdGggZnJvbSBcInBhdGhcIjtcclxuaW1wb3J0IHsgY29tcG9uZW50VGFnZ2VyIH0gZnJvbSBcImxvdmFibGUtdGFnZ2VyXCI7XHJcblxyXG4vLyBodHRwczovL3ZpdGVqcy5kZXYvY29uZmlnL1xyXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoKHsgbW9kZSB9KSA9PiB7XHJcbiAgLy8gTG9hZCBWSVRFX0FQSV9VUkwgZnJvbSAuZW52LmxvY2FsIC8gLmVudiAvIGV0Yy4gc28gdGhlIGRldi1zZXJ2ZXIgcHJveHlcclxuICAvLyBhbmQgdGhlIGFwcCdzIHJ1bnRpbWUgQVBJIGNsaWVudCBwb2ludCBhdCB0aGUgc2FtZSBiYWNrZW5kLiBTaW5nbGUgc291cmNlXHJcbiAgLy8gb2YgdHJ1dGggbGl2ZXMgaW4gLmVudi5sb2NhbC5cclxuICBjb25zdCBlbnYgPSBsb2FkRW52KG1vZGUsIHByb2Nlc3MuY3dkKCksIFwiXCIpO1xyXG4gIGNvbnN0IGFwaVRhcmdldCA9XHJcbiAgICBlbnYuVklURV9BUElfVVJMID8/XHJcbiAgICBcImh0dHBzOi8vY2VudHJpb24tYmFja2VuZC1nYmU0YTdhN2QyaDVka2RlLmNhbmFkYWNlbnRyYWwtMDEuYXp1cmV3ZWJzaXRlcy5uZXRcIjtcclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIHNlcnZlcjoge1xyXG4gICAgICBob3N0OiBcIjo6XCIsXHJcbiAgICAgIHBvcnQ6IDgwODAsXHJcbiAgICAgIGhtcjoge1xyXG4gICAgICAgIG92ZXJsYXk6IGZhbHNlLFxyXG4gICAgICB9LFxyXG4gICAgICAvLyBBbGxvdyB0aGlzIGRldiBzZXJ2ZXIgdG8gYmUgcmVhY2hlZCB0aHJvdWdoIG5ncm9rIC8gQ2xvdWRmbGFyZSAvIGV0Yy5cclxuICAgICAgLy8gVml0ZSdzIGhvc3QgY2hlY2sgYmxvY2tzIHVua25vd24gSG9zdCBoZWFkZXJzIGJ5IGRlZmF1bHQ7IHRoZSBsZWFkaW5nXHJcbiAgICAgIC8vIGRvdCBpcyBWaXRlIHN5bnRheCBmb3IgXCJhbnkgc3ViZG9tYWluIG9mIHRoaXMgYmFzZVwiLlxyXG4gICAgICBhbGxvd2VkSG9zdHM6IFtcclxuICAgICAgICBcImxvY2FsaG9zdFwiLFxyXG4gICAgICAgIFwiLm5ncm9rLWZyZWUuZGV2XCIsXHJcbiAgICAgICAgXCIubmdyb2stZnJlZS5hcHBcIixcclxuICAgICAgICBcIi5uZ3Jvay5pb1wiLFxyXG4gICAgICAgIFwiLnRyeWNsb3VkZmxhcmUuY29tXCIsXHJcbiAgICAgIF0sXHJcbiAgICAgIHByb3h5OiB7XHJcbiAgICAgICAgXCIvYXBpXCI6IHtcclxuICAgICAgICAgIHRhcmdldDogYXBpVGFyZ2V0LFxyXG4gICAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0sXHJcbiAgICB9LFxyXG4gICAgcGx1Z2luczogW3JlYWN0KCksIG1vZGUgPT09IFwiZGV2ZWxvcG1lbnRcIiAmJiBjb21wb25lbnRUYWdnZXIoKV0uZmlsdGVyKEJvb2xlYW4pLFxyXG4gICAgcmVzb2x2ZToge1xyXG4gICAgICBhbGlhczoge1xyXG4gICAgICAgIFwiQFwiOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCBcIi4vc3JjXCIpLFxyXG4gICAgICB9LFxyXG4gICAgICBkZWR1cGU6IFtcInJlYWN0XCIsIFwicmVhY3QtZG9tXCIsIFwicmVhY3QvanN4LXJ1bnRpbWVcIiwgXCJyZWFjdC9qc3gtZGV2LXJ1bnRpbWVcIiwgXCJAdGFuc3RhY2svcmVhY3QtcXVlcnlcIiwgXCJAdGFuc3RhY2svcXVlcnktY29yZVwiXSxcclxuICAgIH0sXHJcbiAgfTtcclxufSk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBa1AsU0FBUyxjQUFjLGVBQWU7QUFDeFIsT0FBTyxXQUFXO0FBQ2xCLE9BQU8sVUFBVTtBQUNqQixTQUFTLHVCQUF1QjtBQUhoQyxJQUFNLG1DQUFtQztBQU16QyxJQUFPLHNCQUFRLGFBQWEsQ0FBQyxFQUFFLEtBQUssTUFBTTtBQUl4QyxRQUFNLE1BQU0sUUFBUSxNQUFNLFFBQVEsSUFBSSxHQUFHLEVBQUU7QUFDM0MsUUFBTSxZQUNKLElBQUksZ0JBQ0o7QUFFRixTQUFPO0FBQUEsSUFDTCxRQUFRO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixLQUFLO0FBQUEsUUFDSCxTQUFTO0FBQUEsTUFDWDtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BSUEsY0FBYztBQUFBLFFBQ1o7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRjtBQUFBLE1BQ0EsT0FBTztBQUFBLFFBQ0wsUUFBUTtBQUFBLFVBQ04sUUFBUTtBQUFBLFVBQ1IsY0FBYztBQUFBLFFBQ2hCO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQSxJQUNBLFNBQVMsQ0FBQyxNQUFNLEdBQUcsU0FBUyxpQkFBaUIsZ0JBQWdCLENBQUMsRUFBRSxPQUFPLE9BQU87QUFBQSxJQUM5RSxTQUFTO0FBQUEsTUFDUCxPQUFPO0FBQUEsUUFDTCxLQUFLLEtBQUssUUFBUSxrQ0FBVyxPQUFPO0FBQUEsTUFDdEM7QUFBQSxNQUNBLFFBQVEsQ0FBQyxTQUFTLGFBQWEscUJBQXFCLHlCQUF5Qix5QkFBeUIsc0JBQXNCO0FBQUEsSUFDOUg7QUFBQSxFQUNGO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
