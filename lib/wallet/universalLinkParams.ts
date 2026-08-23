/** Reserved Telegram start_param prefix. Must be handled before opaque tab tokens. */
export const WALLET_UL_START_PREFIX = "ulcb_";

const CHALLENGE_ID_SHAPE = /^[A-Za-z0-9_-]{8,64}$/;

export function parseWalletUlStartParam(startParam: string): string | null {
  if (!startParam.startsWith(WALLET_UL_START_PREFIX)) {
    return null;
  }
  const challengeId = startParam.slice(WALLET_UL_START_PREFIX.length);
  if (!CHALLENGE_ID_SHAPE.test(challengeId)) {
    return null;
  }
  return challengeId;
}

export function buildWalletUlStartParam(challengeId: string): string {
  return `${WALLET_UL_START_PREFIX}${challengeId}`;
}

export function isWalletUlChallengeId(value: string): boolean {
  return CHALLENGE_ID_SHAPE.test(value);
}

/** Phantom / Solflare / Backpack encryption pubkey query names (current docs). */
export function readUniversalLinkEncryptionPublicKey(
  params: URLSearchParams,
): string | null {
  return (
    params.get("phantom_encryption_public_key") ??
    params.get("solflare_encryption_public_key") ??
    params.get("wallet_encryption_public_key") ??
    params.get("encryption_public_key")
  );
}
