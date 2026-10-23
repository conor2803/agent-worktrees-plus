import { defineConfig } from "@vscode/test-cli";
import * as path from "node:path";
import { buildFixture } from "./bench/fixture.mjs";

// The performance benchmark (docs/performance.md). Not part of CI: it runs for
// minutes and its numbers only mean something on one machine, compared with
// themselves. `npm run bench`.
const fixture = buildFixture();
const out = process.env.BENCH_OUT ?? path.resolve("bench/results/latest.json");

export default defineConfig({
  files: "out/test/bench/**/*.bench.js",
  version: "stable",
  // A checkout under .worktrees/ makes the default user-data dir's socket path
  // longer than macOS allows; point this somewhere short to run from one.
  launchArgs: process.env.VSCODE_TEST_USER_DATA
    ? ["--user-data-dir", process.env.VSCODE_TEST_USER_DATA]
    : [],
  workspaceFolder: fixture.workspaceFile,
  env: {
    CLAUDE_CONFIG_DIR: fixture.claudeDir,
    BENCH_FIXTURE: path.join(fixture.root, "fixture.json"),
    BENCH_OUT: out,
  },
  mocha: { ui: "tdd", timeout: 0 },
});
