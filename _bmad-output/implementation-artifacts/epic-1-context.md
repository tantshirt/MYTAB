# Epic 1 Context: Signed in and wallet-ready, inside Telegram

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

When someone opens My Tab from a Telegram link, they are already authenticated with a Privy embedded Solana wallet—no login screen, connect-wallet step, or seed phrase. This epic establishes the greenfield repository scaffold, the Astryx design foundation, the pure integer-money domain module, and the full auth identity stack (Privy → Convex → verified Telegram binding) that every later epic builds on. It carries Day 0 Gate items 1–4; no UI feature work proceeds until a Privy access token returns a non-null Convex identity (Story 1.5).

## Stories

- Story 1.1: Project scaffold with coordinated Vercel and Convex deployment
- Story 1.2: My Tab design foundation on Astryx
- Story 1.3: Integer money module in lib/domain
- Story 1.4: Zero-click Privy Telegram login with an embedded Solana wallet
- Story 1.5: A Privy access token authenticates a Convex query
- Story 1.6: Token-bridge fallback for Convex authentication *(contingency — build only if Story 1.5 fails)*
- Story 1.7: Verified Telegram identity bound to the Privy DID
- Story 1.8: Wallet record synced with one default receiving wallet
- Story 1.9: Opaque session tokens that resolve, expire, and revoke
- Story 1.10: External Solana wallet connection

## Requirements & Constraints

**Authentication and identity.** Privy is the sole auth provider with zero-click Telegram login inside the Mini App. The Privy DID from a verified JWT is the external auth subject; the Convex document `_id` is the internal foreign key. Solana addresses are never primary keys. Privy access tokens flow through `ConvexProviderWithAuth`; every public Convex function exposing private data must call shared auth helpers (`requireIdentity`, `getCurrentUser`)—never ad-hoc checks and never client-supplied DIDs, Telegram IDs, chat IDs, wallet IDs, or addresses.

**Telegram binding.** Telegram identity is bound only after server-side validation of raw Mini App `initData` via authenticated `POST /telegram/bootstrap` in Convex HTTP Actions. `initDataUnsafe` is never trusted. Mutations require both a valid Privy identity and fresh server-side Telegram group context; outside Telegram, authenticated reads work but mutations are rejected.

**Wallets.** One Privy embedded Solana wallet is created or restored on first login. Convex stores only Privy wallet ID and Solana address—no keys or seed material. Exactly one default receiving wallet per user; embedded vs external types are distinct. External wallets are P1 and gated behind the embedded path.

**Money.** Fiat amounts are signed int64 minor units (THB in satang). Crypto amounts are atomic-unit integers (`bigint` in memory, decimal string across JSON). Mint decimals travel with every amount. JavaScript floats must never enter persisted money; domain functions reject non-integer numbers. Money fields use `Minor` or `Atomic` suffixes.

**Security and privacy.** No server secret uses a `NEXT_PUBLIC_` prefix. Preview and production credentials are separate. Store only Telegram profile fields the product renders. Never store raw Privy tokens. Convex enforces authorization; the UI does not.

**Deployment.** Single Next.js repo with colocated Convex backend. One build command (`npx convex deploy --cmd 'npm run build'`) deploys both targets. Preview environments are visibly non-production and fail-closed on real Telegram messages, sponsor spend, and production provider egress. Forbidden dependencies (PostgreSQL clients, TanStack Query, shadcn/ui, etc.) must stay absent with a build-time guard.

**Day 0 Gate (items 1–4).** (1) App loads in Telegram from Vercel. (2) Privy seamless auth creates embedded wallet. (3) Privy token authenticates a Convex query—issuer normalization against bare `privy.io` is unproven (highest-risk seam). (4) Raw `initData` verifies in bootstrap; group membership authorizes access.

## Technical Decisions

**Repository shape.** Follow the Structural Seed: `app/(miniapp)/`, `app/api/`, `components/primitives/`, `features/`, `lib/domain/`, `lib/{telegram,privy,solana,dflow,formatting}/`, `convex/` with `convex/internal/`, and `tests/{domain,convex,e2e}/`. No second backend, component system, or state layer.

**Runtime split.** Convex owns product truth, HTTP ingress (Telegram webhook, bootstrap, receipt ingress), and all domain writes. Next.js Route Handlers are limited to health and the optional auth token bridge—never privileged Convex writes or domain logic.

**Auth path.** Primary: `convex/auth.config.ts` with `type: 'customJwt'`, `issuer: 'privy.io'`, Privy app ID, `algorithm: 'ES256'`, and a base64 `data:` URI JWKS (Privy publishes no hosted JWKS). Fallback (Story 1.6 only): Vercel Route Handler verifies Privy token, mints a 5-minute My Tab JWT, serves JWKS at `/.well-known/jwks.json`. Client-supplied user IDs are forbidden in either path.

**Provider order.** Fixed: `TelegramRuntimeProvider` → `PrivyProvider` → `PrivyConvexProvider` → theme. Live Convex-subscribing surfaces are Client Components; no authenticated SSR. Do not use TanStack Query for Convex data.

**Domain purity.** `lib/domain/` imports nothing from Convex, performs no I/O, reads no env vars. Unit tests run without network or database.

**Secrets placement.** Convex holds DFlow key, Telegram bot token and webhook secret, OpenAI key, Privy app secret and sponsor wallet ID, server RPC key, and provider-webhook secrets. Vercel holds `CONVEX_DEPLOY_KEY` plus, if fallback activates, Privy verification credentials and token-bridge signing key.

**Design system.** Astryx (`@astryxdesign/core`, `@astryxdesign/theme-neutral`, `@stylexjs/stylex`) is the only component system—exact pinned versions, no `@stylexjs/babel-plugin`. React 19, TypeScript 5 strict, Next.js App Router stable.

**Session tokens.** Opaque, high-entropy, hashed at rest. `tab_session` is reusable (24h); `action_token` is single-use (10 min). Resolution, expiry, and revocation happen only server-side in Convex.

## UX & Interaction Patterns

**Invisible auth.** No login screen, connect-wallet affordance, or wallet-selection step inside Telegram. The user arrives authenticated with a wallet already present.

**Launch surface (Authenticating).** Wordmark, indeterminate indicator, copy "Getting your tab ready…"—no buttons, login affordance, or elapsed timer.

**Auth recovering.** Session refresh is silent. On genuine failure: a single inline "Reconnecting…" bar with cached reads still visible—never a modal or logout.

**Design foundation (Story 1.2).** Forced light mode only. 21 color tokens, 4 radius tokens, 8-step spacing scale. Instrument Sans type scale with Thai/Latin support. Tabular numerals everywhere including skeletons. Border-led elevation—no hover lift or layered card stacks. Single-column layout (390px design, 320px floor), 16px gutters, 20px card padding; primary action pinned to bottom surface bar above safe area, never a FAB. Telegram Desktop centers the same column.

**You surface.** Shows receiving preference in plain language—no token list, portfolio value, price chart, or network selector.

**Outside Telegram.** Authenticated reads available; mutations disabled with "Open this in Telegram to make changes."

## Cross-Story Dependencies

- **1.1** is the foundation—all later stories assume the scaffold, deployment pipeline, and secret placement.
- **1.2** and **1.3** can proceed in parallel once 1.1 exists; neither blocks auth work.
- **1.4** depends on 1.1 (providers scaffold) and precedes wallet and Telegram binding stories.
- **1.5** is the project's highest-risk seam and Day 0 Gate item 3. If Convex rejects bare `privy.io` issuer, **1.6** activates immediately and blocks all UI feature work until identity is non-null.
- **1.7** requires working Privy auth (1.4, 1.5 or 1.6) and implements Day 0 Gate item 4.
- **1.8** depends on 1.4 (embedded wallet creation) and 1.5/1.6 (authenticated Convex writes).
- **1.9** depends on auth infrastructure; token resolution integrates with later deep-link and group flows (Epic 2+).
- **1.10** is P1—build only after embedded wallet, receiving-wallet guard, and exact-USDC Day 0 transaction pass; changes no identity invariant.
