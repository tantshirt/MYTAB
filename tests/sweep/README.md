# `tests/sweep/` — populated data seams for `npm run sweep`

`scripts/sweep.mjs` measures amount-column truncation, name clipping, touch
targets and horizontal overflow at 320px. All of that needs surfaces with
*content*: an empty state has no amount column to truncate.

Since no fixture data survives under `app/`, `features/` or `components/`, the
sweep gets its content by **replacing the data seams at build time**. Each file
here exports the same names as one `features/**/use*Data` module and returns
data from `tests/fixtures/`. `next.config.ts` maps the seam's `@/…` request onto
the file here — but only inside the sweep's own build, which:

* must set `MYTAB_SWEEP_FIXTURES=1` (only `scripts/sweep.mjs` sets it),
* must write to `NEXT_DIST_DIR=.next-sweep`, never the deployable `.next/`,
* must have `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_PRIVY_APP_ID` empty,
* must not be running on Vercel or in CI.

`next.config.ts` throws if any of those is violated, so the alias cannot exist
in a bundle anyone ships. Nothing in this directory is reachable from a normal
`next build`: it is not imported by a single line of source.

`tests/features/no-fixtures-in-source.test.ts` is the regression guard.
