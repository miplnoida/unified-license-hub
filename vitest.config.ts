import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

/**
 * Bounded jsdom concurrency.
 *
 * The suite is dominated by full-screen jsdom integration renders (Radix
 * dialogs, selects, sheets and server-paged registers). Each worker builds its
 * own jsdom environment, so an unbounded pool on a 16-CPU host oversubscribes
 * CPU and memory: measured on this repository, the unbounded default produced 13
 * five-second timeouts, 4 workers produced 3 failures and later an unstable
 * certification run, and 2 workers produced the fewest failures at ~3.3 GB peak
 * resident. Two workers is therefore the canonical default bound for both local
 * and CI runs — no extra flags to remember.
 *
 * Override with VITEST_MAX_WORKERS when a machine warrants it, e.g.
 * `VITEST_MAX_WORKERS=8 npm test`.
 */
const workers = Number(process.env.VITEST_MAX_WORKERS ?? 2);


export default defineConfig({
  plugins: [react()],
  define: { __BUILD_REVISION__: JSON.stringify("test"), __BUILD_TIME__: JSON.stringify("test") },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    maxWorkers: workers,
    minWorkers: 1,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
