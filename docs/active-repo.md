# Active Repo

> Last updated: 2026-10-23

A window can have several Repos open as workspace folders. The panel shows one
of them, the **Active Repo**, chosen from a dropdown in its header (or the
**Switch Repository** command). Terms are as in [CONTEXT.md](../CONTEXT.md).

## Why one at a time

Showing every Repo at once would mean a gather (a `git status` per Worktree) for
each Repo on every refresh. One Active Repo keeps the cost of a refresh the cost
of one Repo, however many folders the window has. What the panel still owes the
user about the other Repos is cheap and comes from the session registry: how
many of their Agents are Waiting, shown in the dropdown and the Activity Bar
badge, and the waiting notification.

## What identifies a Repo

Its shared git directory, found by walking up from a folder to its `.git` entry
(`src/repos.ts`, no git spawn). A Linked Worktree's `.git` file points into
`<commonDir>/worktrees/<name>`, so a Linked Worktree open as a folder is the same
Repo as its Primary Worktree and is listed once. Two clones of one remote are
two Repos; when their folder names match, the dropdown adds the parent folder.

## Which Repo is active

The one saved for this window (`workspaceState`), while it is still among the
folders; otherwise the first. Adding or removing folders re-reads the list.

## What changes on a switch

Everything the panel holds about the previous Repo is per-Repo and is dropped:
the payload, status timestamps, re-gather counts, pending events. The update
token is bumped, so a gather still running for the previous Repo cannot post,
and every payload carries the Repo it was gathered for as a second guard. The
last payload seen for the new Repo, if any, paints at once and a fresh gather
replaces it.

## Agents in other Repos

Each session's Repo is judged once, from its folder, when it first appears in
the registry. Only the Active Repo's sessions reach the cards, so only theirs
cost transcript reads. Two cases that used to cost full gathers no longer do:

- **A Foreign Agent** (one in another Repo) writing or ending its session.
- **An unplaced folder that is not a Not-yet-placed Agent's.** Only a folder in
  the Active Repo, inside a Worktree with no card, is gathered for; a Foreign
  Agent's folder, or a subfolder of a carded Worktree, never is.

## Source Control scoping

Scoping to a Worktree closes the Active Repo's other Worktrees in the Source
Control view and leaves every other Repo alone. The Git extension remembers a
closed repository across reloads, so closing other Repos' would have outlived
the click.

## Measured

See [performance](performance.md).
