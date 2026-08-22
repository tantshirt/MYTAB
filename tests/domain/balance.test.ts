import { describe, expect, it } from "vitest";
import { fiatMinor } from "@/tests/helpers/money";
import {
  deriveWithinGroupBalance,
  formatBalanceHeroParts,
  formatBalanceHeroText,
  isBillComplete,
  resolveBalanceHero,
} from "@/lib/domain/balance";

describe("Story 7.5 — within-group balance derivation", () => {
  const obligations = [
    {
      id: "o1",
      tabId: "t1",
      billId: "b1",
      debtorUserId: "alice",
      creditorUserId: "bob",
      amountMinor: fiatMinor(10_000),
      revision: 1,
      superseded: false,
    },
    {
      id: "o2",
      tabId: "t2",
      billId: "b2",
      debtorUserId: "bob",
      creditorUserId: "alice",
      amountMinor: fiatMinor(3_000),
      revision: 1,
      superseded: false,
    },
  ];

  it("AC1 — derives from immutable ledger offsets", () => {
    const result = deriveWithinGroupBalance({
      obligations,
      offsets: [
        {
          obligationId: "o1",
          tabId: "t1",
          billId: "b1",
          debtorUserId: "alice",
          creditorUserId: "bob",
          amountMinor: fiatMinor(10_000),
          kind: "settlement_offset",
          confirmed: true,
        },
      ],
    });

    expect(result.isAllSquare).toBe(false);
    expect(result.components).toHaveLength(1);
    expect(result.components[0]?.obligationId).toBe("o2");
  });

  it("AC4 — all square when nets cancel", () => {
    const result = deriveWithinGroupBalance({
      obligations,
      offsets: [
        {
          obligationId: "o1",
          tabId: "t1",
          billId: "b1",
          debtorUserId: "alice",
          creditorUserId: "bob",
          amountMinor: fiatMinor(10_000),
          kind: "settlement_offset",
          confirmed: true,
        },
        {
          obligationId: "o2",
          tabId: "t2",
          billId: "b2",
          debtorUserId: "bob",
          creditorUserId: "alice",
          amountMinor: fiatMinor(3_000),
          kind: "settlement_offset",
          confirmed: true,
        },
      ],
    });

    expect(result.isAllSquare).toBe(true);
  });

  it("AC2 — submitted offsets do not count when unconfirmed", () => {
    const result = deriveWithinGroupBalance({
      obligations: [obligations[0]!],
      offsets: [
        {
          obligationId: "o1",
          tabId: "t1",
          billId: "b1",
          debtorUserId: "alice",
          creditorUserId: "bob",
          amountMinor: fiatMinor(5_000),
          kind: "settlement_offset",
          confirmed: false,
        },
      ],
    });

    expect(result.components[0]?.amountMinor).toBe(10_000);
  });

  it("AC5 — bill completion is independent of group position", () => {
    const complete = isBillComplete({
      obligations,
      offsets: [
        {
          obligationId: "o1",
          tabId: "t1",
          billId: "b1",
          debtorUserId: "alice",
          creditorUserId: "bob",
          amountMinor: fiatMinor(10_000),
          kind: "settlement_offset",
          confirmed: true,
        },
      ],
      billId: "b1",
      revision: 1,
    });

    expect(complete).toBe(true);
  });
});

describe("Story 7.1 — balance hero", () => {
  it("AC1 — three plain-language states", () => {
    expect(
      formatBalanceHeroText({ kind: "all_square" }),
    ).toBe("All square");
    expect(
      formatBalanceHeroText({ kind: "owed", amountMinor: fiatMinor(29_174) }),
    ).toBe("You owe ฿291.74");
    expect(
      formatBalanceHeroText({
        kind: "settled",
        amountAtomic: 42_100_000n,
        tokenLabel: "USDC",
      }),
    ).toContain("You are owed");
    expect(
      formatBalanceHeroText({
        kind: "settled",
        amountAtomic: 42_100_000n,
        tokenLabel: "USDC",
      }),
    ).toContain("USDC");
  });

  // POLISH-SPEC §2.3: the label and the figure must be separable so the figure
  // can be laid out on its own line and never truncated.
  it("splits the label from the figure", () => {
    expect(formatBalanceHeroParts({ kind: "owed", amountMinor: fiatMinor(184_000) })).toEqual({
      label: "You owe",
      figure: "฿1,840.00",
    });
    expect(
      formatBalanceHeroParts({ kind: "settled", amountAtomic: 42_100_000n, tokenLabel: "USDC" }),
    ).toEqual({ label: "You are owed", figure: "42.100000 USDC" });
    expect(formatBalanceHeroParts({ kind: "all_square" })).toEqual({
      label: null,
      figure: "All square",
    });
  });

  it("AC3 — amounts stated to full precision", () => {
    const text = formatBalanceHeroText({ kind: "owed", amountMinor: fiatMinor(29_173) });
    expect(text).toBe("You owe ฿291.73");
  });

  it("resolves owed vs all square from viewer position", () => {
    const balance = deriveWithinGroupBalance({
      obligations: [
        {
          id: "o1",
          tabId: "t1",
          billId: "b1",
          debtorUserId: "viewer",
          creditorUserId: "other",
          amountMinor: fiatMinor(500),
          revision: 1,
          superseded: false,
        },
      ],
      offsets: [],
    });

    expect(resolveBalanceHero({ viewerUserId: "viewer", groupBalance: balance }).kind).toBe(
      "owed",
    );
    expect(resolveBalanceHero({ viewerUserId: "other", groupBalance: balance }).kind).toBe(
      "settled",
    );
  });
});
