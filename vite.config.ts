import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, /api/* is served by `wrangler dev` (port 8787).
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://127.0.0.1:8787" } },
  build: { target: "es2022", cssCodeSplit: false },
});
