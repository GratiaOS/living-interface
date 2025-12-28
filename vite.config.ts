import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const useLocalGardenCore = process.env.LOCAL_GARDEN_CORE === "1";
const localPresenceKernel = path.resolve(
  __dirname,
  "../garden-core/packages/presence-kernel/src/index.ts"
);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: useLocalGardenCore
      ? { "@gratiaos/presence-kernel": localPresenceKernel }
      : {},
  },
  server: { port: 5173, open: true },
});
