// Turns a benchmark result (bench/results/*.json) into the Markdown table
// docs/performance.md shows, optionally beside a baseline:
//   node bench/report.mjs [result.json] [baseline.json]
import * as fs from "node:fs";

const [resultPath = "bench/results/latest.json", baselinePath] = process.argv.slice(2);
const result = JSON.parse(fs.readFileSync(resultPath, "utf8"));
const baseline = baselinePath ? JSON.parse(fs.readFileSync(baselinePath, "utf8")) : undefined;

const perMinute = (phase, name) => {
  const n = phase?.counts?.[name] ?? 0;
  return Math.round((n / (phase?.ms ?? 1)) * 60_000 * 10) / 10;
};
const gitTotal = (phase) =>
  Object.entries(phase?.counts ?? {})
    .filter(([k]) => k.startsWith("git."))
    .reduce((sum, [, n]) => sum + n, 0);
const gitPerMinute = (phase) => Math.round((gitTotal(phase) / (phase?.ms ?? 1)) * 60_000 * 10) / 10;
const p = (phase, q) => phase?.timings?.["gather.ms"]?.[q] ?? "-";

const cell = (now, then) => (then === undefined ? `${now}` : `${then} → ${now}`);

console.log(`Recorded ${result.recordedAt} on ${result.platform}, VS Code ${result.vscode}, window focused: ${result.windowFocused}`);
if (baseline) console.log(`Baseline ${baseline.recordedAt}; cells read baseline → now.`);
console.log("");
console.log("| Phase | Full reloads/min | git commands/min | Reload ms p50 | Reload ms p95 |");
console.log("| --- | --- | --- | --- | --- |");
for (const [name, phase] of Object.entries(result.phases)) {
  const base = baseline?.phases?.[name];
  console.log(
    `| ${name} | ${cell(perMinute(phase, "gather.full"), base && perMinute(base, "gather.full"))} | ` +
      `${cell(gitPerMinute(phase), base && gitPerMinute(base))} | ` +
      `${cell(p(phase, "p50"), base && p(base, "p50"))} | ${cell(p(phase, "p95"), base && p(base, "p95"))} |`
  );
}
const switching = result.phases.switchRepo?.timings ?? {};
for (const [name, label] of [
  ["switch.snapshotPaintMs", "Switch, last snapshot painted"],
  ["switch.paintMs", "Switch, fresh gather painted"],
]) {
  const t = switching[name];
  if (t) console.log(`\n${label}: p50 ${t.p50} ms, p95 ${t.p95} ms, max ${t.max} ms (${t.count} switches)`);
}
const unfocused = Object.entries(result.phases).filter(([, ph]) => (ph.focusedShare ?? 1) < 0.95);
if (unfocused.length) {
  console.log(
    `\nNOT VALID: the window lost focus during ${unfocused.map(([n, ph]) => `${n} (${Math.round(ph.focusedShare * 100)}% focused)`).join(", ")}. ` +
      "The Git extension does not run status for an unfocused window; rerun with the test window in front."
  );
}
console.log("");
console.log("Why full reloads happened (count per phase):");
for (const [name, phase] of Object.entries(result.phases)) {
  const reasons = Object.entries(phase.counts)
    .filter(([k]) => k.startsWith("fallback.") || k.startsWith("trigger."))
    .map(([k, n]) => `${k}=${n}`)
    .join(" ");
  console.log(`- ${name}: ${reasons || "none"}`);
}
