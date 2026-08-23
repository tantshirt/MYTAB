/**
 * First-run connect gate copy (D-25, D-26, D-27).
 * Named wallets are fine. Avoid the DeFi-terminal "connect wallet" phrase.
 */

export const CONNECT_COPY = {
  title: "Bring the wallet you already use.",
  body: "Phantom, Solflare or Backpack. Or use a My Tab wallet if you don't have one yet.",
  phantom: "Connect Phantom",
  solflare: "Connect Solflare",
  backpack: "Connect Backpack",
  embedded: "Use a My Tab wallet",
  skip: "Not now — I'll claim first",
  skipHint: "You can browse and claim without a wallet. Pay is when you'll need one.",
  linking: "Waiting for your wallet…",
  failed: "That wallet didn't come back. Try again, or skip and claim.",
  failedCallback: "The wallet opened, but nothing came back. Nothing was linked.",
  sheetLabel: "Choose a wallet",
} as const;
