# AGENTS.md

This repository's agent instructions live in **[`CLAUDE.md`](./CLAUDE.md)**. Read it.

Before that, read **[`docs/DECISIONS.md`](./docs/DECISIONS.md)** — the binding decision log.
Where any planning artifact in this repo conflicts with `DECISIONS.md`, **`DECISIONS.md` wins**.

Short version, so nothing here depends on another file being loaded:

- Gates: `npx tsc --noEmit` · `npm test` · `npx next build` · `npm run smoke` · `npm run sweep`.
  A green `next build` is **not** sufficient — it compiles the bundle and never executes it.
- **Never run `npx convex env list`** (prints secrets in plaintext).
- **Never run `git stash`** (multiple agents share this tree).
