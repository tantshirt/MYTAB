export const WALLET_UL_RESUME_STATUS_KEY = "mytab:wallet-ul-resume";
export const WALLET_UL_RESUME_EVENT = "mytab:wallet-ul-resume";

export type WalletUlResumeStatus = "idle" | "working" | "linked" | "failed";

export function writeWalletUlResumeStatus(status: WalletUlResumeStatus): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    sessionStorage.setItem(WALLET_UL_RESUME_STATUS_KEY, status);
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new CustomEvent(WALLET_UL_RESUME_EVENT, { detail: status }));
}

export function readWalletUlResumeStatus(): WalletUlResumeStatus {
  if (typeof window === "undefined") {
    return "idle";
  }
  try {
    const raw = sessionStorage.getItem(WALLET_UL_RESUME_STATUS_KEY);
    if (raw === "working" || raw === "linked" || raw === "failed") {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return "idle";
}

/** Pure gate so resume never one-shots before Privy can call Convex. */
export function shouldStartWalletUlResume(input: {
  started: boolean;
  ready: boolean;
  authenticated: boolean;
  challengeId: string | null | undefined;
}): boolean {
  return Boolean(input.challengeId && input.ready && input.authenticated && !input.started);
}
