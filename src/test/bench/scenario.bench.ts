import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { randomUUID } from "crypto";
import type { PerfCounters, PerfSnapshot } from "../../perf";

/**
 * The performance benchmark's scenario (docs/performance.md). Runs the real
 * extension against the synthetic world bench/fixture.mjs built, drives it
 * through fixed phases, and writes what each phase cost to BENCH_OUT.
 */

interface BenchAgent {
  name: string;
  cwd: string;
  status: string;
  pid: number;
  sessionId: string;
  startedAt: number;
}
interface BenchRepo {
  name: string;
  primary: string;
  linked: string[];
}
interface Fixture {
  root: string;
  claudeDir: string;
  repos: BenchRepo[];
  agents: BenchAgent[];
}

const PHASE_MS = Number(process.env.BENCH_PHASE_MS ?? 60_000);
const WARMUP_MS = 15_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function writeSession(fx: Fixture, a: BenchAgent): void {
  fs.writeFileSync(
    path.join(fx.claudeDir, "sessions", `${a.pid}.json`),
    JSON.stringify({
      pid: a.pid,
      sessionId: a.sessionId,
      cwd: a.cwd,
      kind: "interactive",
      status: a.status,
      name: a.name,
      startedAt: a.startedAt,
    })
  );
}

function endAgent(fx: Fixture, a: BenchAgent): void {
  try {
    process.kill(a.pid);
  } catch {
    /* already gone */
  }
  fs.rmSync(path.join(fx.claudeDir, "sessions", `${a.pid}.json`), { force: true });
  fx.agents = fx.agents.filter((x) => x !== a);
}

function startAgent(fx: Fixture, name: string, cwd: string): BenchAgent {
  const child = cp.spawn("sleep", ["7200"], { detached: true, stdio: "ignore" });
  child.unref();
  const a: BenchAgent = {
    name,
    cwd,
    status: "busy",
    pid: child.pid!,
    sessionId: randomUUID(),
    startedAt: Date.now(),
  };
  writeSession(fx, a);
  fx.agents.push(a);
  return a;
}

/** Repeat `step` every `everyMs` until `forMs` has passed. */
async function every(everyMs: number, forMs: number, step: (i: number) => void) {
  const until = Date.now() + forMs;
  for (let i = 0; Date.now() < until; i++) {
    step(i);
    await sleep(everyMs);
  }
}

const touch = (dir: string, i: number) =>
  fs.writeFileSync(path.join(dir, "src", `file${i % 50}.txt`), `edit ${Date.now()}\n`);

const flip = (fx: Fixture, a: BenchAgent) => {
  a.status = a.status === "busy" ? "idle" : "busy";
  writeSession(fx, a);
};

suite("Agent Worktrees Plus benchmark", () => {
  const fx: Fixture = JSON.parse(fs.readFileSync(process.env.BENCH_FIXTURE!, "utf8"));
  const [alpha, bravo, charlie, delta] = fx.repos;
  const agent = (name: string) => fx.agents.find((a) => a.name === name)!;
  const phases: Record<string, PerfSnapshot & { ms: number; focusedShare: number }> = {};
  let perf: PerfCounters;

  async function phase(name: string, drive: () => Promise<void>) {
    perf.reset();
    const started = Date.now();
    // The Git extension does not run status for an unfocused window, so a phase
    // that lost focus measured something else; the report flags it.
    let samples = 0;
    let focused = 0;
    const sampler = setInterval(() => {
      samples++;
      if (vscode.window.state.focused) focused++;
    }, 1_000);
    await drive();
    clearInterval(sampler);
    const focusedShare = samples ? Math.round((focused / samples) * 100) / 100 : 0;
    phases[name] = { ...perf.snapshot(), ms: Date.now() - started, focusedShare };
  }

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension<{ perf: PerfCounters }>(
      "conor2803.agent-worktrees-plus"
    )!;
    perf = (await ext.activate()).perf;
    await vscode.commands.executeCommand("agentWorktreesPlusView.panel.focus");
    await sleep(WARMUP_MS);
  });

  suiteTeardown(() => {
    for (const a of [...fx.agents]) endAgent(fx, a);
    fs.mkdirSync(path.dirname(process.env.BENCH_OUT!), { recursive: true });
    fs.writeFileSync(
      process.env.BENCH_OUT!,
      JSON.stringify(
        {
          recordedAt: new Date().toISOString(),
          vscode: vscode.version,
          platform: `${process.platform}-${process.arch}`,
          windowFocused: vscode.window.state.focused,
          phaseMs: PHASE_MS,
          phases,
        },
        null,
        2
      )
    );
    fs.rmSync(fx.root, { recursive: true, force: true });
  });

  test("idle: nothing happens", () => phase("idle", () => sleep(PHASE_MS)));

  test("other repos busy: files and agents change outside the first repo", () =>
    phase("otherReposBusy", () =>
      every(2_000, PHASE_MS, (i) => {
        touch(i % 2 ? bravo.primary : charlie.linked[0], i);
        if (i % 3 === 0) flip(fx, agent("bravo-primary"));
        if (i % 3 === 1) flip(fx, agent("delta-primary"));
      })
    ));

  test("first repo busy: files and agents change in the first repo", () =>
    phase("firstRepoBusy", () =>
      every(2_000, PHASE_MS, (i) => {
        touch(i % 2 ? alpha.primary : alpha.linked[0], i);
        if (i % 3 === 0) flip(fx, agent("alpha-primary"));
      })
    ));

  test("agent lifecycle: agents start and end, here and elsewhere", () =>
    phase("agentLifecycle", async () => {
      endAgent(fx, agent("delta-primary"));
      await sleep(PHASE_MS / 6);
      startAgent(fx, "charlie-new", charlie.linked[2]);
      await sleep(PHASE_MS / 6);
      endAgent(fx, agent("bravo-primary"));
      await sleep(PHASE_MS / 6);
      startAgent(fx, "delta-new", delta.linked[0]);
      await sleep(PHASE_MS / 6);
      // An Agent creating its own Worktree in the first Repo, the case the
      // re-gather exists for.
      const wt = path.join(alpha.primary, ".worktrees", "wt-new");
      cp.execFileSync("git", ["worktree", "add", "-q", "-b", "feature-new", wt], {
        cwd: alpha.primary,
      });
      startAgent(fx, "alpha-new", wt);
      await sleep(PHASE_MS / 3);
    }));
});
