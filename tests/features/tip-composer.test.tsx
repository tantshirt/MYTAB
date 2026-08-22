import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  TipComposer,
  TIP_COPY,
  composeTipSignature,
  nextIdempotency,
} from "@/features/tips/TipComposer";
import { findBannedCopyWords } from "@/lib/telegram/messages";
import { ParticipantChip } from "@/components/primitives/participant-chip";

const MEMBERS = [
  {
    userId: "users:viewer",
    displayName: "Andre",
    membershipStatus: "active" as const,
    walletReady: true,
  },
  {
    userId: "users:maya",
    displayName: "Maya",
    membershipStatus: "active" as const,
    walletReady: true,
  },
  {
    userId: "users:no-wallet",
    displayName: "Noi",
    membershipStatus: "active" as const,
    walletReady: false,
  },
];

describe("Story 3.1 — Tip Composer", () => {
  it("lists verified members as people without wallet addresses", () => {
    const html = renderToStaticMarkup(
      <TipComposer members={MEMBERS} viewerUserId="users:viewer" preselectedRecipientUserId="users:maya" />,
    );

    expect(html).toContain("Send a tip");
    expect(html).toContain("Maya");
    expect(html).not.toContain("users:maya");
    expect(html).not.toContain("wallet");
    // Noi has no wallet ready, but a friend who silently vanishes reads as a
    // bug — she is present, disabled, with the reason on her chip (§1.11).
    expect(html).toContain("Noi");
    expect(html).toContain("Hasn&#x27;t opened My Tab yet");
    expect(html).toContain("disabled");
  });

  it("renders preset amounts and optional note field", () => {
    const html = renderToStaticMarkup(
      <TipComposer members={MEMBERS} viewerUserId="users:viewer" />,
    );

    expect(html).toContain("฿20");
    expect(html).toContain("฿100");
    expect(html).toContain("Say something nice");
    expect(html).toContain("🙏");
    expect(html).toContain("Send tip");
  });
});

describe("POLISH-SPEC §4 — Tip Composer states", () => {
  it("§4.2 — no eligible recipients", () => {
    const html = renderToStaticMarkup(
      <TipComposer members={[MEMBERS[0]!]} viewerUserId="users:viewer" />,
    );
    expect(html).toContain("Nobody here has opened My Tab yet. Once they do, you can tip them.");
  });

  it("§4.3 — a failed send names its next action", () => {
    const html = renderToStaticMarkup(
      <TipComposer members={MEMBERS} viewerUserId="users:viewer" sendFailed />,
    );
    expect(html).toContain("Couldn&#x27;t send the tip. Try again.");
  });

  it("§4.4 / §4.5 — money never moves offline or outside Telegram, and the reason is stated", () => {
    const offline = renderToStaticMarkup(
      <TipComposer members={MEMBERS} viewerUserId="users:viewer" offline />,
    );
    expect(offline).toContain("You&#x27;re offline. We&#x27;ll catch up.");
    expect(offline).toContain("Needs a connection.");
    expect(offline).toContain("disabled");

    const browser = renderToStaticMarkup(
      <TipComposer members={MEMBERS} viewerUserId="users:viewer" inTelegram={false} />,
    );
    expect(browser).toContain("Open this in Telegram to make changes.");
  });

  it("the hero amount reads as money, not digits", () => {
    const html = renderToStaticMarkup(
      <TipComposer members={MEMBERS} viewerUserId="users:viewer" />,
    );
    expect(html).toContain('aria-label="100 baht"');
  });
});

describe("POLISH-SPEC §1.11 — Tip Composer polish (P2 item 30)", () => {
  /** `renderToStaticMarkup` escapes apostrophes; the copy is compared as rendered. */
  const esc = (text: string) => text.replace(/'/g, "&#x27;");

  const LEFT_MEMBER = {
    userId: "users:tim",
    displayName: "Tim",
    membershipStatus: "left" as const,
    walletReady: true,
  };
  const RESTRICTED_MEMBER = {
    userId: "users:ploy",
    displayName: "Ploy",
    membershipStatus: "restricted" as const,
    walletReady: true,
  };

  it("every ineligible person is shown, disabled, with their own reason", () => {
    const html = renderToStaticMarkup(
      <TipComposer
        members={[...MEMBERS, LEFT_MEMBER, RESTRICTED_MEMBER]}
        viewerUserId="users:viewer"
      />,
    );

    expect(html).toContain("Noi");
    expect(html).toContain(esc(TIP_COPY.reasonNotReady));
    expect(html).toContain("Tim");
    expect(html).toContain(esc(TIP_COPY.reasonNotInGroup));
    expect(html).toContain("Ploy");
    expect(html).toContain(esc(TIP_COPY.reasonRestricted));
    // Three chips cannot be picked, and each says so.
    expect(html.match(/disabled=""/g)).toHaveLength(3);
  });

  it("the viewer is the one silent omission — you do not tip yourself", () => {
    const html = renderToStaticMarkup(
      <TipComposer members={MEMBERS} viewerUserId="users:viewer" />,
    );
    expect(html).not.toContain("Andre");
  });

  it("membership is named before readiness — a person who left is not 'waiting'", () => {
    const html = renderToStaticMarkup(
      <TipComposer
        members={[
          MEMBERS[0]!,
          { ...LEFT_MEMBER, walletReady: false },
        ]}
        viewerUserId="users:viewer"
      />,
    );
    expect(html).toContain(esc(TIP_COPY.reasonNotInGroup));
    expect(html).not.toContain(esc(TIP_COPY.reasonNotReady));
  });

  it("the three bad-amount states have three sentences", () => {
    expect(TIP_COPY.invalidAmount).toBe("Enter an amount above ฿0.");
    expect(TIP_COPY.amountTooSmall).toBe("The smallest tip is ฿1.00.");
    expect(TIP_COPY.amountTooLarge).toBe("The largest tip is ฿100,000.00.");
    // Three distinct causes, three distinct sentences — none is a silent catch.
    expect(
      new Set([TIP_COPY.invalidAmount, TIP_COPY.amountTooSmall, TIP_COPY.amountTooLarge]).size,
    ).toBe(3);
  });

  it("selector avatars are 40px and selection is a ring, never a fill", () => {
    const html = renderToStaticMarkup(
      <TipComposer
        members={MEMBERS}
        viewerUserId="users:viewer"
        preselectedRecipientUserId="users:maya"
      />,
    );
    expect(html).toContain("width:40px;height:40px");
    expect(html).not.toContain("width:52px;height:52px");
    expect(html).toContain("box-shadow:0 0 0 2px #1E51D2");
    // The dead transition placeholder is gone.
    expect(html).not.toContain("0 0 0 0 transparent");
  });

  it("chip names truncate and every chip clears 44px", () => {
    const html = renderToStaticMarkup(
      <TipComposer
        members={[
          MEMBERS[0]!,
          {
            userId: "users:long",
            displayName: "Nattapong Chaiyawattana",
            membershipStatus: "active" as const,
            walletReady: true,
          },
        ]}
        viewerUserId="users:viewer"
      />,
    );
    expect(html).toContain("text-overflow:ellipsis");
    expect(html).toContain("min-height:44px");
  });

  it("the send glyph is stroked in an existing token, not a stray hex", () => {
    const html = renderToStaticMarkup(
      <TipComposer members={MEMBERS} viewerUserId="users:viewer" />,
    );
    expect(html).toContain('stroke="#F8EDE4"');
    expect(html).not.toContain("#F1CBB2");
  });

  it("the hero amount holds at 320px rather than truncating", () => {
    const html = renderToStaticMarkup(
      <TipComposer members={MEMBERS} viewerUserId="users:viewer" />,
    );
    expect(html).toContain("clamp(32px, 10.8vw, 42px)");
    expect(html).toContain("white-space:nowrap");
  });

  it("says nothing on the banned list", () => {
    const copy = [
      TIP_COPY.emptyRecipients,
      TIP_COPY.invalidAmount,
      TIP_COPY.amountTooSmall,
      TIP_COPY.amountTooLarge,
      TIP_COPY.sendFailed,
      TIP_COPY.sending,
      TIP_COPY.send,
      TIP_COPY.reasonNotReady,
      TIP_COPY.reasonNotInGroup,
      TIP_COPY.reasonRestricted,
    ].join(" ");
    expect(findBannedCopyWords(copy)).toEqual([]);
  });
});

describe("POLISH-SPEC §1.11 — the send action cannot fire twice", () => {
  const BASE = {
    recipientUserId: "users:maya",
    amountThbMinor: 10_000 as never,
    note: "",
    reaction: null,
  };

  it("a second press of the same tip reuses the key, so the server collapses it", () => {
    const composition = composeTipSignature(BASE);
    let minted = 0;
    const mint = () => `key-${++minted}`;

    const first = nextIdempotency(null, composition, mint);
    const second = nextIdempotency(first, composition, mint);

    expect(second).toBe(first);
    expect(second.key).toBe("key-1");
    // The old code minted a new key per press, which is what made the guard
    // decorative — idempotency cannot collapse two different keys.
    expect(minted).toBe(1);
  });

  it("changing any part of the tip makes it a different tip, with a new key", () => {
    let minted = 0;
    const mint = () => `key-${++minted}`;
    const first = nextIdempotency(null, composeTipSignature(BASE), mint);

    const variants = [
      { ...BASE, recipientUserId: "users:noi" },
      { ...BASE, amountThbMinor: 20_000 as never },
      { ...BASE, note: "thank you" },
      { ...BASE, reaction: "🙏" },
    ];

    for (const variant of variants) {
      const next = nextIdempotency(first, composeTipSignature(variant), mint);
      expect(next.key).not.toBe(first.key);
    }
    expect(minted).toBe(5);
  });

  it("whitespace-only note edits are not a different tip", () => {
    expect(composeTipSignature({ ...BASE, note: "  " })).toBe(composeTipSignature(BASE));
  });

  it("the primary reports its busy state and repeats why it is unavailable", () => {
    const html = renderToStaticMarkup(
      <TipComposer members={MEMBERS} viewerUserId="users:viewer" offline />,
    );
    expect(html).toContain("aria-busy");
    expect(html).toContain("disabled");
    expect(html).toContain("Needs a connection.");
  });

  it("a failed send names its next action and leaves the action live", () => {
    const html = renderToStaticMarkup(
      <TipComposer members={MEMBERS} viewerUserId="users:viewer" sendFailed />,
    );
    expect(html).toContain("Couldn&#x27;t send the tip. Try again.");
    expect(html).toContain('role="alert"');
  });
});

describe("DESIGN.md — participant-chip has two sizes and only two", () => {
  it("28px in stacks, 40px in selectors", () => {
    const selector = renderToStaticMarkup(
      <ParticipantChip userId="users:maya" displayName="Maya" onSelect={() => undefined} />,
    );
    const stack = renderToStaticMarkup(
      <ParticipantChip userId="users:maya" displayName="Maya" size="stack" />,
    );

    expect(selector).toContain("width:40px;height:40px");
    expect(stack).toContain("width:28px;height:28px");
    // A stack is a count of faces, not a list of labels.
    expect(stack).toContain('aria-label="Maya"');
    expect(stack).not.toContain("text-overflow:ellipsis");
  });

  it("selection is a 2px ring, never a fill", () => {
    const on = renderToStaticMarkup(
      <ParticipantChip userId="users:maya" displayName="Maya" selected onSelect={() => undefined} />,
    );
    const off = renderToStaticMarkup(
      <ParticipantChip userId="users:maya" displayName="Maya" onSelect={() => undefined} />,
    );

    expect(on).toContain("box-shadow:0 0 0 2px #1E51D2");
    expect(off).not.toContain("box-shadow");
    // The tint is the fill in both states, so the white initial stays readable.
    expect(on).toContain("background:#B0603E");
    expect(off).toContain("background:#B0603E");
  });

  it("a disabled chip is never silent about why", () => {
    const html = renderToStaticMarkup(
      <ParticipantChip
        userId="users:noi"
        displayName="Noi"
        disabled
        reason={TIP_COPY.reasonNotReady}
      />,
    );
    expect(html).toContain("disabled");
    expect(html).toContain("Hasn&#x27;t opened My Tab yet");
    expect(html).toContain("cursor:not-allowed");
  });
});
