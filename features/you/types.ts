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
  | { kind: "ready"; publicKey: string }
  | { kind: "provisioning" }
  | { kind: "failed" };

export type YouSurfaceData = {
  status: "loading" | "ready" | "error";
  viewer: YouViewer | null;
  wallet: YouWallet;
  /** Rendered as "My Tab · build {buildLabel}". */
  buildLabel: string;
  /** Telegram support chat. */
  supportUrl: string;
};
