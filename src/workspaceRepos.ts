import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {
  GitDirProbe,
  Repo,
  RepoFolder,
  WorktreeLocation,
  catalogRepos,
  locateWorktree,
} from "./repos";

const diskProbe: GitDirProbe = {
  gitEntry(dir) {
    try {
      const file = path.join(dir, ".git");
      const stat = fs.statSync(file, { throwIfNoEntry: false });
      if (!stat) return undefined;
      if (stat.isDirectory()) return { kind: "dir" };
      return { kind: "file", text: fs.readFileSync(file, "utf8") };
    } catch {
      return undefined;
    }
  },
  readText(file) {
    try {
      return fs.readFileSync(file, "utf8");
    } catch {
      return undefined;
    }
  },
};

/** The same directory however it was reached (a symlinked tmp, a case-folded
 *  path), so Repo ids from workspace folders and from Agents' folders compare. */
export function canonical(p: string): string {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return p;
  }
}

/**
 * The window's Repos, and which Repo any folder belongs to.
 *
 * Locations are cached per folder for the window's life: a folder's Repo does
 * not change, and an Agent's folder is asked about on every registry read.
 */
export class WorkspaceRepos {
  private readonly locations = new Map<string, WorktreeLocation | null>();

  /**
   * The Worktree and Repo containing `folder`, or undefined outside any Repo.
   * `fresh` skips the cache: a Worktree being created has no `.git` file for a
   * moment, and a cached answer from that moment would place it in its parent.
   */
  locate(folder: string, opts: { fresh?: boolean } = {}): WorktreeLocation | undefined {
    let loc = opts.fresh ? undefined : this.locations.get(folder);
    if (loc === undefined) {
      const found = locateWorktree(folder, diskProbe);
      loc = found ? { worktree: found.worktree, commonDir: canonical(found.commonDir) } : null;
      this.locations.set(folder, loc);
    }
    return loc ?? undefined;
  }

  /** The Repo id `folder` belongs to, if any. */
  repoIdOf(folder: string): string | undefined {
    return this.locate(folder)?.commonDir;
  }

  /** The Repos among the window's workspace folders, each once, in folder order. */
  catalog(): Repo[] {
    const folders: RepoFolder[] = [];
    for (const f of vscode.workspace.workspaceFolders ?? []) {
      const commonDir = this.repoIdOf(f.uri.fsPath);
      if (commonDir) folders.push({ folderPath: f.uri.fsPath, commonDir });
    }
    return catalogRepos(folders);
  }
}
