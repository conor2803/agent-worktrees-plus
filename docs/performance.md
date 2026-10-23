# Performance

> Last updated: 2026-10-23

The panel's cost is the work it does unprompted: `git` commands, full reloads of
every Worktree's status (a "gather"), and transcript reads. This page says how
that is measured and what the numbers are. The numbers live in
[`bench/results/`](../bench/results/), which is the record; the tables below are
generated from them.

## Counters

`src/perf.ts` counts, in the running extension host:

| Name | What it counts |
| --- | --- |
| `git.<subcommand>` | every `git` the extension runs, by subcommand |
| `gather.full`, `gather.ms` | full reloads, and how long each took to paint |
| `refresh.agents`, `refresh.repos` | the cheap paths: agent rows only, one card's status only |
| `trigger.*` | the events that asked for work: registry writes, Git extension status runs, focus, saves, visibility |
| `fallback.*` | each reason a cheap path gave up and ran a full reload |
| `transcript.tail`, `transcript.scan` | transcript reads |
| `ps.*` | process-table reads |

A running window writes them to the output channel (View → Output → Agent
Worktrees) once a minute, as totals since activation:

```
perf (12 min since activation): gather.full=31 git.status=140 ... gather.ms(p50/p95/max)=150/260/410
```

## The benchmark

```
npm run bench
```

It builds a synthetic world (`bench/fixture.mjs`), opens it in a real VS Code
extension host, runs a fixed scenario (`src/test/bench/scenario.bench.ts`), and
writes `bench/results/latest.json`. `node bench/report.mjs <result> [baseline]`
prints the tables. It is not part of CI: it runs for about five minutes, opens a
VS Code window, and its numbers are only comparable with runs on the same
machine.

**The world.** Three Repos open as workspace folders (alpha, bravo, charlie) and
a fourth (delta) that is not. Each has 1,500 tracked files and three Linked
Worktrees under `.worktrees/`, nested inside the Primary Worktree. Six Agents,
spread across all four, written into a private `CLAUDE_CONFIG_DIR` and backed by
real processes. The workspace sets `git.detectWorktrees: true`.

**The phases**, 60 seconds each after a 15-second warm-up:

| Phase | What happens |
| --- | --- |
| `idle` | nothing |
| `otherReposBusy` | every 2s a file changes in bravo or charlie; Agents in bravo and delta change status |
| `firstRepoBusy` | every 2s a file changes in alpha; an alpha Agent changes status |
| `agentLifecycle` | Agents end and start in other Repos, then an Agent creates its own Worktree in alpha |

The panel shows alpha, the first workspace folder. Work in bravo, charlie and
delta is therefore work the panel cannot show, and ideally costs nothing.

## Targets

Agreed before any change was made:

- Switching the Active Repo paints in under 1 second.
- Agents in other Repos cause zero extra full reloads.
- A hidden panel runs no more `git` than it does today.
- Memory stays flat over an hour of use.

## Results

### Baseline: 4.6.12 behaviour, counters only

Two runs, to show the noise between runs on one machine.

Run 1 (`bench/results/baseline.json`):

Recorded 2026-10-23T18:33:14.161Z on darwin-arm64, VS Code 1.143.1, window focused: true

| Phase | Full reloads/min | git commands/min | Reload ms p50 | Reload ms p95 |
| --- | --- | --- | --- | --- |
| idle | 1 | 5 | 273 | 273 |
| otherReposBusy | 27 | 134.8 | 137 | 178 |
| firstRepoBusy | 13 | 90.9 | 192 | 262 |
| agentLifecycle | 7 | 51.8 | 234 | 343 |

Why full reloads happened (count per phase):
- idle: trigger.focus=1
- otherReposBusy: fallback.agents.unplaced=3 fallback.repos.unknownRoot=24 trigger.registry=20 trigger.repoState=36
- firstRepoBusy: fallback.repos.unknownRoot=13 trigger.registry=10 trigger.repoState=25
- agentLifecycle: fallback.agents.sessionEnded=2 fallback.agents.unplaced=3 fallback.repos.unknownRoot=2 trigger.registry=5 trigger.repoState=4

Run 2 (`bench/results/baseline-2.json`):

Recorded 2026-10-23T18:37:46.321Z on darwin-arm64, VS Code 1.143.1, window focused: true

| Phase | Full reloads/min | git commands/min | Reload ms p50 | Reload ms p95 |
| --- | --- | --- | --- | --- |
| idle | 1 | 5 | 192 | 192 |
| otherReposBusy | 34 | 169.8 | 134 | 167 |
| firstRepoBusy | 14 | 96.9 | 139 | 184 |
| agentLifecycle | 7 | 51.8 | 201 | 379 |

Why full reloads happened (count per phase):
- idle: trigger.focus=1
- otherReposBusy: fallback.agents.unplaced=3 fallback.repos.unknownRoot=31 trigger.registry=20 trigger.repoState=36
- firstRepoBusy: fallback.repos.unknownRoot=14 trigger.registry=10 trigger.repoState=26
- agentLifecycle: fallback.agents.sessionEnded=2 fallback.agents.unplaced=3 fallback.repos.unknownRoot=2 trigger.registry=5 trigger.repoState=5

**What it shows.** With only the other Repos busy, the panel ran 27 to 34 full
reloads a minute, two to three times what it ran when its own Repo was busy.
Almost all of them are `fallback.repos.unknownRoot`: the Git extension finished a
status run in another Repo, the panel had no card for it, and gathered every
Worktree of its own Repo to find out. Agents in other Repos add a few more
(`fallback.agents.unplaced`, `fallback.agents.sessionEnded`).

## Your own window

The benchmark's world is synthetic. To compare your real window, install a build,
use it normally, and read the `perf` lines in the output channel: reloads and git
commands per minute are the totals divided by the minutes since activation.

VS Code's own Git extension is a separate cost. With `git.detectWorktrees` on, it
opens every Worktree as its own repository, each with a recursive file watcher
and its own status runs. Every one of those runs reaches this extension as an
event. The default is off, and the panel already lists Worktrees, so turning it
off is recommended unless you use the Source Control view per Worktree.
