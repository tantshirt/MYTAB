import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AllSquareCard,
  ALL_SQUARE_COPY,
  hasSeenAllSquare,
  markAllSquareSeen,
} from "@/features/balances/AllSquareCard";
import { billKeyFor, isCompletionEdge } from "@/features/balances/useAllSquareTrigger";
import { BANNED_COPY_WORDS, findBannedCopyWords } from "@/lib/telegram/messages";
import { MYTAB_COLORS } from "@/lib/theme/tokens";

const CAST = [
  { userId: "users:maya", displayName: "Maya" },
  { userId: "users:andre", displayName: "Andre" },
  { userId: "users:noi", displayName: "Noi" },
  { userId: "users:ploy", displayName: "Ploy" },
  { userId: "users:tim", displayName: "Tim" },
];

function render(props: Partial<React.ComponentProps<typeof AllSquareCard>> = {}) {
  return renderToStaticMarkup(
    <AllSquareCard
      billName="Sukhumvit Dinner"
      amountLabel="฿1,840.00"
      settledCount={5}
      totalCount={5}
      members={CAST}
      onDismiss={() => undefined}
      {...props}
    />,
  );
}

describe("POLISH-SPEC §1.10 — All Square, the completion moment", () => {
  it("says all four lines the artboard says", () => {
    const html = render();
    expect(html).toContain("All square");
    expect(html).toContain("Sukhumvit Dinner");
    expect(html).toContain("฿1,840.00");
    expect(html).toContain("5 of 5 settled");
    expect(html).toContain("Your group tab. Settled.");
  });

  it("is a full-bleed overlay, not a card in the scroll", () => {
    const html = render();
    expect(html).toContain("position:fixed");
    expect(html).toContain("inset:0");
  });

  it("carries the only gradient in the system, from its two dedicated tokens", () => {
    const html = render();
    expect(html).toContain(
      `linear-gradient(180deg, ${MYTAB_COLORS.tipWashTop} 0%, ${MYTAB_COLORS.tipWashMid} 45%, ${MYTAB_COLORS.paper} 100%)`,
    );
    expect(html.match(/linear-gradient/g)).toHaveLength(1);
  });

  it("Reduce Motion keeps the wash and drops only the washing-in (EXPERIENCE)", () => {
    const moving = render({ reduceMotion: false });
    const still = render({ reduceMotion: true });

    expect(moving).toContain("mytab-allsquare-wash 600ms");
    expect(moving).toContain("mytab-allsquare-rise 420ms");
    expect(moving).toContain("mytab-allsquare-draw 480ms");

    // The card still appears; the gradient is styling, not motion.
    expect(still).toContain("linear-gradient");
    expect(still).toContain("All square");
    // The keyframes stay declared in the <style> block; nothing references them.
    expect(still).not.toContain("animation:");
  });

  it("staggers content in reading order at the §5.3 delays", () => {
    const html = render();
    for (const delay of [0, 80, 140, 200, 260, 320]) {
      expect(html).toContain(`mytab-allsquare-rise 420ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`);
    }
  });

  it("'All square' is a state, so it never claims an amount slot", () => {
    const html = render();
    const headline = html.slice(html.indexOf("<h2"), html.indexOf("</h2>"));
    expect(headline).toContain("mytab-type-amount-hero");
    expect(headline).not.toContain("data-mytab-amount");
    expect(headline).not.toContain("mytab-tabular");
  });

  it("the bill total is tabular and reads as money", () => {
    const html = render();
    expect(html).toContain('data-mytab-amount="true"');
    expect(html).toContain('aria-label="1840 baht"');
  });

  it("presence stack is 40px at -10px with a paper ring, and never has invalid CSS", () => {
    const html = render();
    expect(html).toContain("width:40px;height:40px");
    expect(html).toContain("margin-left:-10px");
    expect(html).toContain(`border:3px solid ${MYTAB_COLORS.paper}`);
    expect(html).not.toContain("gap:-8px");
  });

  it("an empty cast renders no stack rather than dead space", () => {
    const html = render({ members: [] });
    expect(html).not.toContain("Everyone on this bill");
    expect(html).toContain("All square");
  });

  it("beyond five faces the stack counts rather than crowds", () => {
    const html = render({
      members: [...CAST, { userId: "users:kit", displayName: "Kit" }],
    });
    expect(html).toContain("+1");
    expect(html).not.toContain(">K<");
  });

  it("never takes focus on mount — the Accessibility Floor owns focus order", () => {
    const html = render();
    expect(html).not.toContain("autofocus");
    expect(html).not.toContain('tabindex="-1"');
  });

  it("Share to group is the primary when it can act; Done is never a dead second button", () => {
    const shareable = render({ onShare: () => undefined });
    expect(shareable).toContain(ALL_SQUARE_COPY.share);
    // Done falls back to the muted text action beneath the primary.
    expect(shareable).toContain(`color:${MYTAB_COLORS.inkMuted};cursor:pointer`);

    // With nowhere to post, the share button is absent rather than inert.
    const plain = render();
    expect(plain).not.toContain(ALL_SQUARE_COPY.share);
    expect(plain).toContain("Done");
  });

  it("every action clears 44px", () => {
    const html = render({ onShare: () => undefined });
    expect(html).toContain("min-height:52px");
    expect(html).toContain("min-height:44px");
  });

  it("says nothing on the banned list", () => {
    const copy = [
      ALL_SQUARE_COPY.headline,
      ALL_SQUARE_COPY.closing,
      ALL_SQUARE_COPY.share,
      ALL_SQUARE_COPY.dismiss,
      ALL_SQUARE_COPY.settledCount(5, 5),
    ].join(" ");
    expect(findBannedCopyWords(copy)).toEqual([]);
    expect(BANNED_COPY_WORDS.length).toBeGreaterThan(0);
    // No confetti, no trophy, no badge count.
    expect(copy).not.toMatch(/🎉|congratulation/i);
  });
});

/**
 * The suite runs on `environment: "node"`, so there is no `window` and no
 * storage. The guard reads `window.localStorage` / `window.sessionStorage`
 * defensively, which is exactly the seam to stand a fake on.
 */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => map.delete(key) as unknown as void,
    setItem: (key: string, value: string) => void map.set(key, value),
  } as Storage;
}

describe("POLISH-SPEC §5.3 — the once-per-bill guard is durable, not session-scoped", () => {
  let local: Storage;
  let session: Storage;

  beforeEach(() => {
    local = memoryStorage();
    session = memoryStorage();
    (globalThis as { window?: unknown }).window = {
      localStorage: local,
      sessionStorage: session,
    };
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("writes the durable key, so a reload cannot replay the moment", () => {
    expect(hasSeenAllSquare("bill-1")).toBe(false);
    markAllSquareSeen("bill-1");
    expect(local.getItem("mytab.allsquare.bill-1")).toBe("1");
    expect(hasSeenAllSquare("bill-1")).toBe(true);
  });

  it("survives a new session — the defect the sessionStorage guard had", () => {
    markAllSquareSeen("bill-1");
    // A new session is a cleared sessionStorage and an intact localStorage.
    session.clear();
    expect(hasSeenAllSquare("bill-1")).toBe(true);
  });

  it("still holds inside the session when durable storage is refused", () => {
    markAllSquareSeen("bill-1");
    local.clear();
    expect(hasSeenAllSquare("bill-1")).toBe(true);
  });

  it("is keyed per bill — a second dinner is a second moment, not a replay", () => {
    markAllSquareSeen("bill-1");
    expect(hasSeenAllSquare("bill-2")).toBe(false);
  });

  it("does not replay a moment an older build already showed this session", () => {
    session.setItem("mytab-all-square-seen:bill-legacy", "1");
    expect(hasSeenAllSquare("bill-legacy")).toBe(true);
  });
});

describe("EXPERIENCE — the trigger is bill completion, and it is an edge", () => {
  it("fires only on false → true, never on a level", () => {
    // The moment itself.
    expect(isCompletionEdge(false, true)).toBe(true);

    // Opening the app onto an already-complete bill: the FIRST value the
    // subscription reports is `undefined → true`, which is a level, not an
    // edge, and is swallowed. This is also what makes the card fire "only for
    // people present in the app at that moment".
    expect(isCompletionEdge(undefined, true)).toBe(false);

    // Still incomplete, and a bill that was already complete re-reporting
    // itself (another payment, an unrelated write) — neither is a transition.
    expect(isCompletionEdge(undefined, false)).toBe(false);
    expect(isCompletionEdge(false, false)).toBe(false);
    expect(isCompletionEdge(true, true)).toBe(false);

    // A bill cannot un-complete into a moment either.
    expect(isCompletionEdge(true, false)).toBe(false);
  });

  it("keys the guard on the bill, not the tab", () => {
    expect(billKeyFor({ tabId: "tabs:1", billId: "bill:1", revision: 2 })).toBe("bill:1");

    // Before any obligation exists there is no billId; a tab at one revision is
    // still one bill, and re-locking the tab makes it a different one.
    expect(billKeyFor({ tabId: "tabs:1", billId: null, revision: 2 })).toBe("tabs:1:2");
    expect(billKeyFor({ tabId: "tabs:1", billId: null, revision: 3 })).not.toBe("tabs:1:2");
  });

  it("the edge and the durable key are independent locks", () => {
    // Even if an edge were somehow observed twice, the storage guard has
    // already claimed the key — and even with storage refused, the edge rule
    // alone stops a reload replaying it, because a reload sees a level.
    expect(isCompletionEdge(undefined, true)).toBe(false);
  });
});
