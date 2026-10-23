// Builds the benchmark's world: synthetic Repos with Linked Worktrees nested the
// way `.worktrees/` sits inside a Primary Worktree, a Claude config dir whose
// session registry holds synthetic Agents, and a multi-root workspace file.
// Agents need a live pid (the registry drops dead ones), so each is backed by a
// detached `sleep` that the scenario kills when it finishes.
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const TRACKED_FILES = 1500;
const LINKED_WORKTREES = 3;

function git(cwd, ...args) {
  execFileSync(
    "git",
    ["-c", "user.name=bench", "-c", "user.email=bench@example.invalid", ...args],
    { cwd, stdio: "ignore" }
  );
}

function makeRepo(root, name) {
  const primary = path.join(root, name);
  fs.mkdirSync(path.join(primary, "src"), { recursive: true });
  for (let i = 0; i < TRACKED_FILES; i++) {
    fs.writeFileSync(path.join(primary, "src", `file${i}.txt`), `line ${i}\n`);
  }
  fs.writeFileSync(path.join(primary, ".gitignore"), ".worktrees/\n");
  git(primary, "init", "-q", "-b", "main");
  git(primary, "add", "-A");
  git(primary, "commit", "-q", "-m", "seed");
  const linked = [];
  for (let i = 1; i <= LINKED_WORKTREES; i++) {
    const wt = path.join(primary, ".worktrees", `wt${i}`);
    git(primary, "worktree", "add", "-q", "-b", `feature-${i}`, wt);
    linked.push(wt);
  }
  return { name, primary, linked };
}

export function spawnAgentProcess() {
  const child = spawn("sleep", ["7200"], { detached: true, stdio: "ignore" });
  child.unref();
  return child.pid;
}

export function writeSession(claudeDir, agent) {
  const file = path.join(claudeDir, "sessions", `${agent.pid}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify({
      pid: agent.pid,
      sessionId: agent.sessionId,
      cwd: agent.cwd,
      kind: "interactive",
      status: agent.status,
      name: agent.name,
      startedAt: agent.startedAt,
    })
  );
}

export function startAgent(claudeDir, { name, cwd, status = "idle" }) {
  const agent = {
    name,
    cwd,
    status,
    pid: spawnAgentProcess(),
    sessionId: randomUUID(),
    startedAt: Date.now(),
  };
  const projectDir = path.join(claudeDir, "projects", "bench");
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, `${agent.sessionId}.jsonl`),
    JSON.stringify({ type: "user", message: { role: "user", content: `bench task for ${name}` } }) + "\n"
  );
  writeSession(claudeDir, agent);
  return agent;
}

export function buildFixture(root = fs.mkdtempSync(path.join(os.tmpdir(), "awtp-bench-"))) {
  const repos = ["alpha", "bravo", "charlie", "delta"].map((n) => makeRepo(root, n));
  const [alpha, bravo, charlie, delta] = repos;
  const claudeDir = path.join(root, "claude");
  fs.mkdirSync(path.join(claudeDir, "sessions"), { recursive: true });
  // The kinds the scenario needs: Agents in the first workspace Repo, Agents in
  // other workspace Repos, and one in a Repo the window does not have open.
  const agents = [
    startAgent(claudeDir, { name: "alpha-primary", cwd: alpha.primary, status: "busy" }),
    startAgent(claudeDir, { name: "alpha-wt1", cwd: alpha.linked[0] }),
    startAgent(claudeDir, { name: "bravo-primary", cwd: bravo.primary, status: "busy" }),
    startAgent(claudeDir, { name: "bravo-wt2", cwd: bravo.linked[1], status: "waiting" }),
    startAgent(claudeDir, { name: "charlie-wt1", cwd: charlie.linked[0] }),
    startAgent(claudeDir, { name: "delta-primary", cwd: delta.primary, status: "busy" }),
  ];
  const workspaceFile = path.join(root, "bench.code-workspace");
  fs.writeFileSync(
    workspaceFile,
    JSON.stringify(
      {
        folders: [alpha, bravo, charlie].map((r) => ({ path: r.primary })),
        // The setting the developer's own window runs with; see docs/performance.md.
        settings: { "git.detectWorktrees": true },
      },
      null,
      2
    )
  );
  const fixture = { root, claudeDir, workspaceFile, repos, agents };
  fs.writeFileSync(path.join(root, "fixture.json"), JSON.stringify(fixture, null, 2));
  return fixture;
}
