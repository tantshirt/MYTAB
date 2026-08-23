/** Shape the You surface renders. Fixture and live data both resolve to this. */

export type YouViewer = {
  userId: string;
  firstName: string;
  lastName?: string;
  /** Telegram `username`, without the `@`. Omitted when the person has none. */
  username?: string;
  /** Telegram `photo_url`. Falls back to the tinted initial — never a silhouette. */
  photoUrl?: string;
};

export type YouWallet =
  | {
      kind: "ready";
      publicKey: string;
      walletKind: "embedded" | "external";
      provider: string | null;
      hasEmbedded: boolean;
    }
  | { kind: "provisioning" }
  | { kind: "failed" }
  | { kind: "none" };

export type YouMoveReceived =
  | {
      visible: true;
      amountLabel: string;
      destinationLabel: string;
    }
  | { visible: false };

export type YouSurfaceData = {
  status: "loading" | "ready" | "error";
  viewer: YouViewer | null;
  wallet: YouWallet;
  /** Rendered as "My Tab · build {buildLabel}". */
  buildLabel: string;
  /** Telegram support chat. */
  supportUrl: string;
  /** U-9 — live invite links this organizer can stop. */
  liveInvites?: LiveInvite[];
  /**
   * The viewer's groups.
   *
   * They live here rather than on Tabs home: a group is picked inside the
   * start-a-tab flow, so a roster on the home screen was a section nobody
   * acted on sitting above sections people did.
   */
  groups?: YouGroup[];
  moveReceived?: YouMoveReceived;
};

export type YouGroup = {
  id: string;
  name: string;
  memberCount: number;
};

export type LiveInvite = {
  tabId: string;
  tokenId: string;
  tabName: string;
  expiresAt: number;
  seatsRemaining: number | null;
};
