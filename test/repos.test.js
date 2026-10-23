"use strict";
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { catalogRepos, chooseActiveRepo, locateWorktree } = require("../out/repos.js");

const p = (...parts) => path.join(path.sep, ...parts);

// --- catalogRepos -------------------------------------------------------------

const folder = (folderPath, primary) => ({
  folderPath,
  commonDir: path.join(primary, ".git"),
});

test("each workspace folder in its own repository is a Repo, in folder order", () => {
  const repos = catalogRepos([
    folder(p("ws", "esi"), p("ws", "esi")),
    folder(p("ws", "mock-server"), p("ws", "mock-server")),
  ]);
  assert.deepStrictEqual(
    repos.map((r) => [r.name, r.label, r.folderPath]),
    [
      ["esi", "esi", p("ws", "esi")],
      ["mock-server", "mock-server", p("ws", "mock-server")],
    ]
  );
});

test("a Linked Worktree open beside its Primary Worktree is the same Repo, listed once", () => {
  const repos = catalogRepos([
    folder(p("ws", "esi"), p("ws", "esi")),
    folder(p("ws", "esi", ".worktrees", "feature"), p("ws", "esi")),
  ]);
  assert.strictEqual(repos.length, 1);
  assert.strictEqual(repos[0].folderPath, p("ws", "esi"));
});

test("a Repo open only through a Linked Worktree is named for its Primary Worktree", () => {
  const [repo] = catalogRepos([folder(p("ws", "esi", ".worktrees", "feature"), p("ws", "esi"))]);
  assert.strictEqual(repo.name, "esi");
  assert.strictEqual(repo.folderPath, p("ws", "esi", ".worktrees", "feature"));
});

test("the Primary Worktree's folder is preferred when both are open, whatever the order", () => {
  const [repo] = catalogRepos([
    folder(p("ws", "esi", ".worktrees", "feature"), p("ws", "esi")),
    folder(p("ws", "esi"), p("ws", "esi")),
  ]);
  assert.strictEqual(repo.folderPath, p("ws", "esi"));
});

test("two clones with the same folder name are two Repos, told apart by their parent folder", () => {
  const repos = catalogRepos([
    folder(p("ws", "esi"), p("ws", "esi")),
    folder(p("scratch", "esi"), p("scratch", "esi")),
  ]);
  assert.deepStrictEqual(
    repos.map((r) => r.label),
    ["esi (ws)", "esi (scratch)"]
  );
  assert.notStrictEqual(repos[0].id, repos[1].id);
});

// --- chooseActiveRepo ---------------------------------------------------------

test("the saved Active Repo is kept while it is still in the workspace", () => {
  const repos = catalogRepos([folder(p("a"), p("a")), folder(p("b"), p("b"))]);
  assert.strictEqual(chooseActiveRepo(repos, repos[1].id), repos[1]);
});

test("with no saved choice, or one no longer open, the first Repo is active", () => {
  const repos = catalogRepos([folder(p("a"), p("a")), folder(p("b"), p("b"))]);
  assert.strictEqual(chooseActiveRepo(repos, undefined), repos[0]);
  assert.strictEqual(chooseActiveRepo(repos, "/gone/.git"), repos[0]);
  assert.strictEqual(chooseActiveRepo([], undefined), undefined);
});

// --- locateWorktree -----------------------------------------------------------

/** A filesystem of `.git` entries: a string is a `.git` file's contents (or a
 *  `commondir` file's), the value `DIR` a `.git` directory. */
const DIR = Symbol("dir");
function probe(entries) {
  return {
    gitEntry: (dir) => {
      const v = entries[path.join(dir, ".git")];
      if (v === undefined) return undefined;
      return v === DIR ? { kind: "dir" } : { kind: "file", text: v };
    },
    readText: (file) => {
      const v = entries[file];
      return typeof v === "string" ? v : undefined;
    },
  };
}

test("a folder in a Primary Worktree belongs to it", () => {
  const fs = probe({ [p("ws", "esi", ".git")]: DIR });
  assert.deepStrictEqual(locateWorktree(p("ws", "esi", "onboarding", "src"), fs), {
    worktree: p("ws", "esi"),
    commonDir: p("ws", "esi", ".git"),
  });
});

test("a folder in a Linked Worktree belongs to it, and to its Primary Worktree's Repo", () => {
  const wt = p("ws", "esi", ".worktrees", "feature");
  const gitdir = p("ws", "esi", ".git", "worktrees", "feature");
  const fs = probe({
    [p("ws", "esi", ".git")]: DIR,
    [path.join(wt, ".git")]: `gitdir: ${gitdir}\n`,
    [path.join(gitdir, "commondir")]: "../..\n",
  });
  assert.deepStrictEqual(locateWorktree(path.join(wt, "src"), fs), {
    worktree: wt,
    commonDir: p("ws", "esi", ".git"),
  });
});

test("a Linked Worktree whose gitdir has no commondir file falls back to its layout", () => {
  const wt = p("elsewhere", "feature");
  const fs = probe({
    [path.join(wt, ".git")]: `gitdir: ${p("ws", "esi", ".git", "worktrees", "feature")}`,
  });
  assert.strictEqual(locateWorktree(wt, fs).commonDir, p("ws", "esi", ".git"));
});

test("a relative gitdir is read against the Worktree", () => {
  const wt = p("ws", "esi", ".worktrees", "feature");
  const fs = probe({
    [path.join(wt, ".git")]: "gitdir: ../../.git/worktrees/feature",
  });
  assert.strictEqual(locateWorktree(wt, fs).commonDir, p("ws", "esi", ".git"));
});

test("a folder in no repository belongs to nothing", () => {
  assert.strictEqual(locateWorktree(p("tmp", "scratch"), probe({})), undefined);
});
