# Agent Worktrees Plus

> Last updated: 2026-10-23

A VS Code panel for watching Claude Code agents at work across the worktrees of a
repository, and for managing those worktrees. This file is the domain glossary:
the words the code, docs and issues use for the things the panel is about.

## Language

### Repositories

**Repo**:
One git repository, identified by its shared git directory, together with all of
its Worktrees. Two clones of the same remote are two Repos.
_Avoid_: project, repository folder, workspace folder

**Worktree**:
One checkout of a Repo's files, on its own branch or detached.
_Avoid_: checkout, card, folder

**Primary Worktree**:
The Worktree a Repo was cloned into, holding the shared git directory.
_Avoid_: main worktree, root, main checkout

**Linked Worktree**:
Any Worktree of a Repo other than its Primary Worktree.
_Avoid_: secondary worktree, child worktree

**Active Repo**:
The one Repo a window is showing, chosen from the Repos among that window's
workspace folders. Each window has its own.
_Avoid_: selected repo, current repo, open repo

### Agents

**Agent**:
A live, interactive Claude Code session. It belongs to the Repo its working
folder is in, and runs in the Worktree containing that folder.
_Avoid_: session, Claude, process

**Subagent**:
A helper an Agent has spawned. It runs in its parent's Worktree unless it was
given its own.
_Avoid_: child agent, task

**Waiting**:
The state of an Agent that cannot continue until the developer answers it.
_Avoid_: blocked, needs input, idle

**Not-yet-placed Agent**:
An Agent that belongs to the Active Repo but whose Worktree has not been listed
yet, as when `claude -w` has just created it. Worth looking for again.
_Avoid_: unplaced, missing agent

**Foreign Agent**:
An Agent that belongs to a Repo other than the Active Repo. Never looked for in
the Active Repo's Worktrees.
_Avoid_: unplaced, orphan agent, other agent
