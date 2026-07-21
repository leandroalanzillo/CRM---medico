import { defineConfig } from "vitest/config";
import path from "path";

// Deliberately NOT extending vite.config.ts: that file is wrapped by
// @lovable.dev/vite-tanstack-config (TanStack Start, Nitro, etc.), none of
// which unit tests need — pulling it in would slow tests down and risks
// breaking if that wrapper changes. This is just enough config to resolve
// the "@/..." import alias used throughout src/.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
