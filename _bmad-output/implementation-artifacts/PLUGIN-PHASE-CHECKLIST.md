# Credential Plug-In Phase Checklist

Status: **ready after fixture-mode implementation** (69/70 stories done; Story 1.6 remains contingency-only).

All application code was built with fixture adapters and fail-closed guards. This checklist is the human gate before production Telegram deployment.

## 1. Environment setup

### Convex (production + preview separate)
- [ ] `TELEGRAM_BOT_TOKEN`
- [ ] `TELEGRAM_WEBHOOK_SECRET`
- [ ] `PRIVY_APP_ID`
- [ ] `PRIVY_APP_SECRET`
- [ ] `PRIVY_VERIFICATION_KEY` (PEM for JWKS data URI)
- [ ] `PRIVY_SPONSOR_WALLET_ID` / sponsor address
- [ ] `SOLANA_RPC_URL` (private RPC)
- [ ] `DFLOW_API_KEY`
- [ ] `OPENAI_API_KEY` (receipt extraction)
- [ ] `SPONSOR_PAUSE=false` (production)

### Vercel
- [ ] `CONVEX_DEPLOY_KEY`
- [ ] `NEXT_PUBLIC_CONVEX_URL` (matches deployed Convex)
- [ ] `NEXT_PUBLIC_PRIVY_APP_ID`
- [ ] Verify `TELEGRAM_WEBHOOK_SECRET` is **not** on Vercel (env-contract test)

## 2. Deploy

```bash
npx convex deploy --cmd 'npm run build'
```

- [ ] Preview deployment shows non-production badge
- [ ] `GET /api/health` returns correct `convexDeployment`
- [ ] Preview egress tests deny Telegram/sponsor/DFlow/RPC

## 3. Day 0 Gate (five items)

In a **deployed Telegram Mini App**:

1. [ ] Next.js loads inside Telegram from Vercel
2. [ ] Privy seamless Telegram auth + embedded Solana wallet
3. [ ] Real Privy access token → `viewer` query returns non-null DID
4. [ ] Verified `initData` binds Telegram user to Privy DID
5. [ ] One exact USDC payment: sign-only → server validate → sponsor co-sign → broadcast → parsed confirmation

### If item 3 fails (OQ-1)
- [ ] Run `bmad-build-auto` for **Story 1.6** (token-bridge fallback)
- [ ] Re-test identity before UI work continues

## 4. DFlow Gate (before Epic 6 live routing)

- [ ] Native SOL → exact USDC with `executionMode=sync`
- [ ] Complete ALT resolution
- [ ] Both AD-10 validation passes
- [ ] Sponsor co-sign + broadcast + finalized confirmation

## 5. Flip fixtures to live

- [ ] Remove or bypass fixture verifiers when env vars present
- [ ] Run full test suite against staging with mocked egress disabled
- [ ] Confirm preview still fail-closed for real Telegram/sponsor spend

## 6. Optional retrospectives

Run headless `bmad-retrospective` for epics 1–8 and fold action items into deferred-work ledger if needed.
