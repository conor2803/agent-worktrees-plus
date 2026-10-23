"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { PerfCounters } = require("../out/perf.js");

test("counts events by name", () => {
  const perf = new PerfCounters();
  perf.count("gather.full");
  perf.count("gather.full");
  perf.count("git.status");
  assert.deepStrictEqual(perf.snapshot().counts, {
    "gather.full": 2,
    "git.status": 1,
  });
});

test("summarises timings as count, median, p95 and max", () => {
  const perf = new PerfCounters();
  for (let ms = 1; ms <= 100; ms++) perf.time("gather.ms", ms);
  assert.deepStrictEqual(perf.snapshot().timings["gather.ms"], {
    count: 100,
    p50: 50,
    p95: 95,
    max: 100,
  });
});

test("reset starts a new measurement window", () => {
  const perf = new PerfCounters();
  perf.count("gather.full");
  perf.time("gather.ms", 10);
  perf.reset();
  assert.deepStrictEqual(perf.snapshot(), { counts: {}, timings: {} });
});

test("a summary line names only what happened, in name order", () => {
  const perf = new PerfCounters();
  perf.count("git.status");
  perf.count("gather.full");
  perf.time("gather.ms", 120);
  assert.strictEqual(
    perf.summaryLine(),
    "gather.full=1 git.status=1 gather.ms(p50/p95/max)=120/120/120"
  );
});

test("an idle window has no summary line", () => {
  assert.strictEqual(new PerfCounters().summaryLine(), undefined);
});
