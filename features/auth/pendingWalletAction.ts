export const PENDING_WALLET_ACTION_KEY = "mytab:pending-wallet-action";

export type PendingWalletAction =
  | { kind: "pay"; obligationId: string }
  | { kind: "lock"; publicToken: string; tabId: string; revision: number }
  | { kind: "tip" };

export function writePendingWalletAction(action: PendingWalletAction): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    sessionStorage.setItem(PENDING_WALLET_ACTION_KEY, JSON.stringify(action));
  } catch {
    /* ignore */
  }
}

export function readPendingWalletAction(): PendingWalletAction | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = sessionStorage.getItem(PENDING_WALLET_ACTION_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as PendingWalletAction;
  } catch {
    return null;
  }
}

export function clearPendingWalletAction(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    sessionStorage.removeItem(PENDING_WALLET_ACTION_KEY);
  } catch {
    /* ignore */
  }
}
