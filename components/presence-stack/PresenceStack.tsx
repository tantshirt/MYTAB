"use client";

import { Avatar, type ClaimantIdentity } from "@/components/claim-row";

export type PresenceStackProps = {
  /**
   * The people to show, already filtered. The stack never decides who belongs in
   * it — the Claim Board removes the viewer before handing them over, because
   * "you are here" is not information (POLISH-SPEC §1.6).
   */
  people: ClaimantIdentity[];
  /** Faces beyond this become a `+n` chip. */
  max?: number;
  size?: number;
  /** How far each face laps the one before it. Negative. */
  overlap?: number;
  /**
   * The colour the ring is cut out of — whatever the stack is sitting on. The
   * caller owns it: the same stack sits on `paper` in a header and on `surface`
   * inside a card.
   */
  ringColor: string;
  /**
   * A live indicator to the right of the faces. `undefined` draws none — the
   * Group member strip is a roster, not a presence stack, and must not imply
   * "now".
   */
  liveDotColor?: string;
  /** Set of tints from `avatarTintsForGroup`, so a face is one colour everywhere. */
  tints?: ReadonlyMap<string, string>;
  /** Faces land rather than appear. False on a surface's own first paint. */
  arriving?: boolean;
  reducedMotion?: boolean;
  /** Spoken name for the whole stack. */
  label: string;
  /** Overflow chip and dot both need a colour for the `+n`. */
  overflowColor: string;
  /** Keeps a 44px row height where the stack shares a header with a title. */
  minHeight?: number;
};

/**
 * `presence-stack` (DESIGN.md; POLISH-SPEC §6.2).
 *
 * Overlapping faces, capped, with a `+n` for the rest — the Claim Board header
 * and the Group member strip both draw one. Extracted verbatim from the board;
 * nothing about it is board-specific any more, so every token it used to reach
 * for is now a prop the caller owns.
 */
export function PresenceStack({
  people,
  max = 3,
  size = 24,
  overlap = -8,
  ringColor,
  liveDotColor,
  tints,
  arriving = false,
  reducedMotion = false,
  label,
  overflowColor,
  minHeight,
}: PresenceStackProps) {
  if (people.length === 0) {
    return null;
  }

  const shown = people.slice(0, max);
  const overflow = people.length - shown.length;

  return (
    <div
      aria-label={label}
      role="img"
      style={{ display: "flex", alignItems: "center", gap: 6, flex: "none", minHeight }}
    >
      <span style={{ display: "flex" }}>
        {shown.map((participant, index) => (
          <span
            key={participant.userId}
            style={{ marginLeft: index === 0 ? 0 : overlap, display: "inline-flex" }}
          >
            <Avatar
              participant={participant}
              size={size}
              ringColor={ringColor}
              arriving={arriving}
              reducedMotion={reducedMotion}
              tint={tints?.get(participant.userId)}
            />
          </span>
        ))}
      </span>
      {overflow > 0 ? (
        <span
          className="mytab-tabular"
          style={{ fontSize: 12, fontWeight: 600, color: overflowColor }}
        >
          +{overflow}
        </span>
      ) : null}
      {/* Live, not idle: the dot is the only thing here that means "now". */}
      {liveDotColor ? (
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: "999px",
            background: liveDotColor,
            flex: "none",
          }}
        />
      ) : null}
    </div>
  );
}
