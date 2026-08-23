import { STATE_COPY } from "@/components/primitives/state-copy";

/**
 * Every string on the You surface, in one place (POLISH-SPEC §3.2, §3.4, §4).
 * There is no state in this product without designed copy.
 *
 * The three §4 strings that are shared with every other surface come from
 * `STATE_COPY` so the product has exactly one of each.
 */
export const YOU_COPY = {
  title: "You",

  groupsSection: "YOUR GROUPS",
  walletSection: "WALLET",
  aboutSection: "ABOUT",

  walletRowLabel: "Solana wallet",
  copyRowAriaLabel: "Copy your Solana wallet key",
  copied: "Copied",
  copyFailed: "Couldn't copy. Long-press to select.",

  receivingLabel: "Receiving",
  receivingValue: "You always receive USDC",
  receivingExplainer:
    "Whoever pays you can be holding any token. It arrives as USDC either way, and the network fee is covered by My Tab.",

  exportLabel: "Export wallet",
  exportSub: "Take your keys to any Solana app.",

  manageWallet: "Manage wallet",

  splitsLabel: "How My Tab splits",
  splitsExplainer:
    "Items go to whoever claimed them. Service charge, VAT and the group tip are shared in proportion to what each person ordered. If a satang is left over, it shows up as its own line so nobody is quietly rounded.",

  helpLabel: "Help",

  groupMembers: (count: number) => `${count} ${count === 1 ? "member" : "members"}`,

  liveLinksSection: "LIVE LINKS",
  liveLinksEmpty: "No live links.",
  stopLink: "Stop this link",
  seatsLeft: (seats: number) => `${seats} ${seats === 1 ? "seat" : "seats"} left`,

  footerNote: "My Tab holds no keys. Your wallet is yours — export it any time.",
  buildPrefix: "My Tab · build ",

  provisioning: "Setting up your wallet…",
  provisioningFailed:
    "We couldn't finish setting up your wallet. Close My Tab and open it again.",
  walletNotReady: "Your wallet isn't ready yet.",
  noneLabel: "No wallet linked",
  noneSub: "Claim without one. You'll need a wallet to pay.",
  addWallet: "Add a wallet",

  viewerFailed: "Couldn't load your details.",
  retry: STATE_COPY.retry,

  offline: STATE_COPY.offline,
  outsideTelegram: STATE_COPY.outsideTelegram,
  needsConnection: STATE_COPY.needsConnection,

  loadingLabel: "Loading your details",

  sheet: {
    title: "Solana wallet",
    microLabel: "SOLANA WALLET",
    copyKey: "Copy key",
    copyKeyAriaLabel: "Copy your Solana wallet key",
    exportLabel: "Export wallet",
    exportSub:
      "My Tab never holds your keys. Exporting takes nothing away from your tabs.",
    connectOther: "Connect a different wallet",
  },
} as const;
