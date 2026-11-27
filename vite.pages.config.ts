import { fileURLToPath } from "node:url";
import { copyFile, writeFile } from "node:fs/promises";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const repositoryRoot = fileURLToPath(new URL("./", import.meta.url));
const outputRoot = fileURLToPath(new URL("./docs/", import.meta.url));

function staticPagesOutput(): Plugin {
  return {
    name: "static-pages-output",
    apply: "build",
    generateBundle() {
      // Reject server dependencies in the actual client graph, not merely a config name.
      const blocked = [...this.getModuleIds()].filter(id => {
        const path = id.replace(/\\/g, "/");
        return /(?:__vite-browser-external|virtual:cloudflare|cloudflare:workers|react-server-dom-)/.test(path)
          || /\/node_modules\/(?:next|vinext|wrangler|@cloudflare)\//.test(path)
          || (path.startsWith(repositoryRoot) && /\/(?:app\/api\/|app\/chatgpt-auth\.|lib\/(?:db|connector-context|connector-runtime)\.)/.test(path));
      });
      if (blocked.length) this.error(`GitHub Pages client includes server-only modules:\n${blocked.join("\n")}`);
    },
    async closeBundle() {
      await writeFile(new URL(".nojekyll", `file://${outputRoot}`), "");
      // This tool is intentionally a standalone enhancement to the static client.
      // Preserve it whenever Vite replaces docs/ during the next Pages build.
      for (const asset of ["smart-planner.js", "smart-planner.css"]) {
        await copyFile(new URL(`./pages/${asset}`, import.meta.url), new URL(`./docs/${asset}`, import.meta.url));
      }
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL("./pages/", import.meta.url)),
  publicDir: fileURLToPath(new URL("./public/", import.meta.url)),
  base: "/Make-Tour-Plan/",
  resolve: { alias: { "@": repositoryRoot } },
  plugins: [react(), staticPagesOutput()],
  build: {
    outDir: outputRoot,
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
  },
});
