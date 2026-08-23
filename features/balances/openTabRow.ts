import type { LiveTabParticipant } from "@/lib/domain/liveTab";
import type { TabCardProps } from "./TabCard";

/**
 * One open tab as Tabs home holds it.
 *
 * A superset of `TabCardProps`, so the quiet list can still spread it straight
 * into `TabCard`, plus everything the live card needs to render the same tab as
 * a room people are in. Kept in its own module because both the data hook and
 * the surface import it, and neither should have to import the other.
 */
export type OpenTabRow = TabCardProps & {
  /** Sort key, and how the live tab is chosen when more than one qualifies. */
  updatedAt: number;
  startedAt: number;
  participants: LiveTabParticipant[];
  itemCount: number;
  claimedItemCount: number;
  /** Formatted for display; capped by the server, with the true total beside it. */
  unclaimedItems: Array<{ itemId: string; name: string; amountLabel: string }>;
  unclaimedCount: number;
  /** How many items the viewer has taken on this tab. */
  viewerClaimedCount: number;
  /**
   * The viewer's share in integer minor units, absolute.
   *
   * Carried alongside the formatted `amountLabel` because the delta line is
   * arithmetic, and arithmetic on a formatted string is how a rounding defect
   * gets in.
   */
  viewerAmountMinor: number;
};
