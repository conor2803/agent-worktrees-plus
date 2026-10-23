import * as path from "path";

/**
 * Repos, the Active Repo, and which Repo and Worktree a folder belongs to.
 * Terms as defined in CONTEXT.md. No vscode import, so the unit suite can load it.
 */

/** One git repository: its shared git directory and every Worktree of it. */
export interface Repo {
  /** The shared git directory. Two clones of one remote have different ones. */
  readonly id: string;
  /** The Primary Worktree's folder name. */
  readonly name: string;
  /** `name`, or `name (parent folder)` when another Repo shares the name. */
  readonly label: string;
  /** The workspace folder this Repo is reached through. */
  readonly folderPath: string;
}

/** A workspace folder that is inside a repository, and that repository. */
export interface RepoFolder {
  readonly folderPath: string;
  readonly commonDir: string;
}

/** The Primary Worktree of a non-bare repository holds the shared git directory. */
function primaryWorktreeOf(commonDir: string): string {
  return path.basename(commonDir) === ".git" ? path.dirname(commonDir) : commonDir;
}

/** The Repos among a window's workspace folders, each once, in folder order. */
export function catalogRepos(folders: readonly RepoFolder[]): Repo[] {
  const byId = new Map<string, RepoFolder[]>();
  for (const f of folders) {
    const list = byId.get(f.commonDir);
    if (list) list.push(f);
    else byId.set(f.commonDir, [f]);
  }
  const drafts = [...byId].map(([id, opened]) => {
    const primary = primaryWorktreeOf(id);
    const reachedThrough = opened.find((f) => f.folderPath === primary) ?? opened[0];
    return { id, primary, name: path.basename(primary), folderPath: reachedThrough.folderPath };
  });
  return drafts.map((d) => {
    const shared = drafts.filter((o) => o.name === d.name).length > 1;
    const label = shared ? `${d.name} (${path.basename(path.dirname(d.primary))})` : d.name;
    return { id: d.id, name: d.name, label, folderPath: d.folderPath };
  });
}

/** The saved Active Repo while it is still open, otherwise the first Repo. */
export function chooseActiveRepo(
  repos: readonly Repo[],
  savedId: string | undefined
): Repo | undefined {
  return repos.find((r) => r.id === savedId) ?? repos[0];
}

/** Where a folder sits: the Worktree containing it, and its Repo's git directory. */
export interface WorktreeLocation {
  readonly worktree: string;
  readonly commonDir: string;
}

/** The reads locateWorktree needs, injectable for tests. */
export interface GitDirProbe {
  /** The `.git` entry directly inside `dir`, if any. */
  gitEntry(dir: string): { kind: "dir" } | { kind: "file"; text: string } | undefined;
  readText(file: string): string | undefined;
}

/**
 * Find the Worktree containing `folder` from the `.git` entries on disk, with no
 * git spawn. A Primary Worktree has a `.git` directory; a Linked Worktree has a
 * `.git` file pointing at `<commonDir>/worktrees/<name>`, which holds a
 * `commondir` file naming the shared directory.
 */
export function locateWorktree(
  folder: string,
  probe: GitDirProbe
): WorktreeLocation | undefined {
  for (let dir = path.resolve(folder); ; dir = path.dirname(dir)) {
    const entry = probe.gitEntry(dir);
    if (entry?.kind === "dir") {
      return { worktree: dir, commonDir: path.join(dir, ".git") };
    }
    if (entry?.kind === "file") {
      const match = /^gitdir:\s*(.+?)\s*$/m.exec(entry.text);
      if (!match) return undefined;
      const gitdir = path.resolve(dir, match[1]);
      const common = probe.readText(path.join(gitdir, "commondir"))?.trim();
      const commonDir = common
        ? path.resolve(gitdir, common)
        : path.dirname(path.dirname(gitdir));
      return { worktree: dir, commonDir };
    }
    if (path.dirname(dir) === dir) return undefined;
  }
}
