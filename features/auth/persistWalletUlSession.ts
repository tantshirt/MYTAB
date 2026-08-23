import type { Id } from "@/convex/_generated/dataModel";
import { writeTelegramSecureStorage } from "@/lib/wallet/telegramSecureStorage";
import {
  readPendingUniversalLink,
  readUniversalLinkSecret,
} from "@/lib/wallet/universalLinks";

export async function persistWalletUlSession(input: {
  challengeId: Id<"walletLinkChallenges">;
  store: (args: {
    challengeId: Id<"walletLinkChallenges">;
    secret: string;
    pending: string;
  }) => Promise<{ ok: boolean }>;
}): Promise<void> {
  const secret = readUniversalLinkSecret();
  const pending = readPendingUniversalLink();
  if (!secret || !pending) {
    return;
  }
  writeTelegramSecureStorage(secret);
  await input.store({
    challengeId: input.challengeId,
    secret,
    pending: JSON.stringify(pending),
  });
}
