import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // The fork pool can deadlock during collection in constrained CI/sandbox
    // environments after a large suite exhausts process slots. Threads keep
    // the same per-file isolation while making the required `npm test` gate
    // deterministic and free of orphaned child processes.
    pool: "threads",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  esbuild: {
    jsx: "automatic",
  },
});
