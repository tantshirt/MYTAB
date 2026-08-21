# Pre-implementation security review — 2026-08-21

## Outcome

The publish-bound planning repository passed a repository-wide static security and architecture review after remediation. No live credentials, private keys, seed phrases, deployment keys, Telegram numeric IDs, private wallet material, or receipt images were found. No application source exists yet, so implementation-level security remains a required future gate.

The review used a threat model covering the public repository, Telegram and browser ingress, Privy identity and wallets, Convex authorization and storage, DFlow and Solana transaction handling, OpenAI receipt extraction, sponsor funds, ledger finality, and receipt privacy.

## Findings fixed before publication

### 1. Resource exhaustion controls were not binding

An authenticated malicious member could have created distinct tabs, uploads, extraction jobs, or provider calls without defined resource ceilings. Duplicate-update idempotency did not protect against many distinct valid requests.

AD-24 and the affected stories now require:

- Atomic per-user, per-group, time-window, concurrency, and global quotas.
- Ten-minute one-use receipt tickets and atomically created pending imports.
- Upload byte, magic-type, decoded-dimension, and pixel-count validation.
- Immediate invalid-blob deletion plus expired-ticket and orphan-blob cleanup.
- Explicit active-import states, provider-attempt settlement, concurrency leases, heartbeats, crash recovery, and terminal release rules.
- DFlow hourly attempt reservation before the first router call.
- Limit-boundary, concurrency, abandonment, timeout, crash, retry, cleanup, and pause tests.

Legitimate behavior remains: multiple open tabs are supported within the reviewed limits, receipt extraction remains in scope, and manual entry stays available during rejection, failure, or operational pause.

### 2. Telegram webhook secret was assigned to two runtimes

Stale backlog text placed the Telegram webhook secret in Vercel even though the sole webhook terminates in Convex. The binding contract now keeps `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` only in Convex. Vercel holds `CONVEX_DEPLOY_KEY` and, only if the AD-5 fallback activates, its verification and bridge-signing credentials. An environment-contract test must fail if the Telegram webhook secret is present in Vercel or absent from Convex.

The retained nonbinding long-form architecture body still contains superseded historical Vercel-ingress prose. Its binding supersession table and the architecture spine explicitly override that text.

## Controls confirmed in the binding plan

- Authenticated Convex Telegram ingress and bootstrap; no public privileged mutation or Vercel write bridge.
- Privy identity plus fresh server-side Telegram context and current group membership for mutations.
- Server-owned payment recipient, amount, mint, and sponsor.
- One versioned fail-closed transaction manifest run before client signing and sponsor co-signing.
- Atomic `sponsor-v1` reservations, small wallet balances, and operational pause.
- Finalized semantic confirmation, exact message-hash matching, sponsor-debit validation, and exactly-once ledger application.
- Authenticated receipt streaming without reusable storage bearer URLs, fixed deletion schedules, and provider isolation.
- Preview isolation from real Telegram, sponsor, DFlow, receipt-provider, and production RPC effects.

## Deferred until code exists

After the scaffold and each security-sensitive epic, rerun repository and diff scans for authorization implementation, XSS, SSRF, injection, parsing, dependency, secret, concurrency, and deployment defects. The planning review cannot prove runtime behavior before `app/`, `convex/`, `lib/`, `features/`, and tests exist.
