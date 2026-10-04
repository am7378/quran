import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * After the build, writes dist/sw.js (from sw.template.js) with every built file and a hash of its
 * contents, so the site can be kept on the device and read offline, and a new version replaces
 * only the files that changed.
 */
function serviceWorker(): Plugin {
  return {
    name: "quran-service-worker",
    apply: "build",
    closeBundle() {
      const out = path.resolve(import.meta.dirname, "dist");
      const files: Record<string, string> = {};
      const walk = (dir: string) => {
        for (const e of fs.readdirSync(path.join(out, dir), { withFileTypes: true })) {
          const rel = dir ? `${dir}/${e.name}` : e.name;
          if (e.isDirectory()) walk(rel);
          else if (rel !== "sw.js") files[rel] = createHash("sha1").update(fs.readFileSync(path.join(out, rel))).digest("hex").slice(0, 12);
        }
      };
      walk("");
      const template = fs.readFileSync(path.resolve(import.meta.dirname, "sw.template.js"), "utf8");
      fs.writeFileSync(path.join(out, "sw.js"), template.replace("__FILES__", JSON.stringify(files)));
    },
  };
}

export default defineConfig({
  // relative, so the built site works wherever it is put (e.g. GitHub Pages under /<repo>/)
  base: "./",
  plugins: [react(), tailwindcss(), serviceWorker()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  server: { port: 5173 },
});
