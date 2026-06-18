import type { Express } from "express";
import express from "express";
import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createServer as createViteServer } from "vite";

export async function startServer(app: Express, port: number) {
  if (process.env.NODE_ENV !== "production") {
    const projectRoot = process.cwd();
    const vite = await createViteServer({
      root: projectRoot,
      configFile: false,
      plugins: [react(), tailwindcss()],
      resolve: {
        alias: {
          "@": path.resolve(projectRoot, "src"),
        },
      },
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(port, "0.0.0.0", () => {
    console.log(`[FactuBot] Full-stack server active at http://localhost:${port}`);
  });
}
