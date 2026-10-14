import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { handleApi } from "./server/handler";
function api(env: Record<string, string>): Plugin {
  return {
    name: "football-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();
        const r = await handleApi(
          new Request(`http://localhost${req.url}`, { method: req.method }),
          env,
        );
        res.statusCode = r.status;
        r.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(await r.text());
      });
    },
  };
}
export default defineConfig(({ mode }) => ({
  plugins: [react(), api(loadEnv(mode, process.cwd(), ""))],
  build: { target: "es2022" },
  server: { host: "0.0.0.0", port: 4173, allowedHosts: ["terminal.local"] },
}));
