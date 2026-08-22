export const CONNECT_GATE_SKIP_KEY = "mytab:connect-gate:v1";

export function hasSkippedConnectGate(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(CONNECT_GATE_SKIP_KEY) === "skipped";
  } catch {
    return false;
  }
}

export function markConnectGateSkipped(): void {
  try {
    window.localStorage.setItem(CONNECT_GATE_SKIP_KEY, "skipped");
  } catch {
    /* private mode — the gate may reappear */
  }
}

export function shouldShowConnectGate(input: {
  linked: boolean;
  skipped: boolean;
}): boolean {
  return !input.linked && !input.skipped;
}
