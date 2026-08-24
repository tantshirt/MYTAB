"use client";

import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { useHasPainted } from "@/components/primitives/use-has-painted";
import {
  useLiveQuery,
  useRetryNonce,
} from "@/features/convex/useConvexData";
import { toActivityRow } from "@/features/balances/activityRow";
import { compressDebts } from "@/lib/domain/debtCompression";
import type { BalanceHeroState } from "@/lib/domain/balance";
import { formatCurrencyMinor } from "@/lib/domain/format";
import { formatCurrencyMinorForA11y } from "@/lib/domain/a11yAmount";
import { fiatMinorFromInteger } from "@/lib/domain/money";
import type { TabsHomeSurfaceProps } from "./TabsHomeSurface";
import type { OpenTabRow } from "./openTabRow";

export type TabsHomeData = {
  status: "loading" | "ready" | "error";
  /** This surface has painted with data before — suppresses the skeleton. */
  hasCachedData: boolean;
  /** Everything the surface renders. State props are wired by the page. */
  content: Pick<
    TabsHomeSurfaceProps,
    | "balanceHero"
    | "openTabs"
    | "groups"
    | "recentActivity"
    | "balanceComponents"
    | "compressedTransfers"
    | "memberNames"
  >;
  retry: () => void;
};

/** Nothing read yet, or nothing to read. Real geometry, no invented money. */
const EMPTY_CONTENT: TabsHomeData["content"] = {
  balanceHero: undefined,
  openTabs: [],
  groups: [],
  recentActivity: [],
  balanceComponents: [],
  compressedTransfers: [],
  memberNames: {},
};

/**
 * The single prop-resolution seam for Tabs home.
 *
 * Live reads, all viewer-scoped — no `groupId` has to be guessed by the client:
 *   `api.balances.forViewer`             — net position, its components, names
 *   `api.balances.listOpenTabsForViewer` — per-tab progress and the viewer's own amount
 *   `api.groups.listForViewer`           — the groups row
 *   `api.activity.listForViewer`         — the "Recent" section
 *
 * The hero is `undefined` until a position is actually known. `BalanceHeroState`
 * has no "unknown" variant, so the alternative would be asserting `all_square`
 * over data we have not read — and rendering "All square" over real debt is
 * precisely the trust defect EXPERIENCE's *Money Legibility* section exists to
 * prevent. An absent hero is honest; a guessed one is not.
 *
 * With no Convex client there is nothing to read and this resolves `ready` with
 * the empty content above, which is §4.2's "No tabs yet. Start one from any
 * Telegram group."
 */
export function useTabsHomeData(): TabsHomeData {
  const hasCachedData = useHasPainted("tabs-home");
  const { nonce, retry } = useRetryNonce();

  const balance = useLiveQuery(api.balances.forViewer, {}, nonce);
  const tabs = useLiveQuery(api.balances.listOpenTabsForViewer, {}, nonce);
  const groups = useLiveQuery(api.groups.listForViewer, {}, nonce);
  const activity = useLiveQuery(api.activity.listForViewer, { limit: 10 }, nonce);

  const content = useMemo<TabsHomeData["content"]>(() => {
    const view = balance.data;
    const memberNames = view?.memberNames ?? {};

    /*
     * The hero. `netAtomic` is the canonical figure and `netMinor` is the
     * bill-currency display figure, which is null whenever the scope spans more
     * than one currency — so a fiat hero is only ever rendered when there is
     * exactly one currency to render it in.
     */
    let balanceHero: BalanceHeroState | undefined;
    if (view && view.viewerUserId !== null) {
      if (view.isAllSquare) {
        balanceHero = { kind: "all_square" };
      } else if (view.netMinor !== null && view.netMinor < 0) {
        balanceHero = {
          kind: "owed",
          amountMinor: fiatMinorFromInteger(Math.abs(view.netMinor)),
          currency: view.displayCurrency ?? "THB",
        };
      } else if (view.netAtomic > 0n) {
        balanceHero = {
          kind: "settled",
          amountAtomic: view.netAtomic,
          tokenLabel: "USDC",
        };
      } else if (view.netMinor === null && view.netAtomic < 0n) {
        // Owed across more than one bill currency: no single fiat figure is
        // truthful, so the hero stays absent rather than summing unlike money.
        balanceHero = undefined;
      }
    }

    const viewerUserId = view?.viewerUserId ?? null;

    const openTabs: OpenTabRow[] = (tabs.data ?? []).map((tab) => {
      const currency = tab.currency ?? "THB";
      const amountMinor = fiatMinorFromInteger(tab.viewerAmountMinor ?? 0);
      const totalMinor =
        tab.billTotalMinor === null ? null : fiatMinorFromInteger(tab.billTotalMinor);

      return {
        tabId: tab.tabId,
        name: tab.name,
        status: tab.status,
        settledCount: tab.settledCount,
        totalCount: tab.totalCount,
        submittedCount: tab.submittedCount,
        peopleCount: tab.peopleCount,
        totalLabel: totalMinor === null ? undefined : formatCurrencyMinor(totalMinor, currency),
        amountLabel: formatCurrencyMinor(amountMinor, currency),
        amountA11yLabel: formatCurrencyMinorForA11y(amountMinor, currency),
        amountTone: tab.amountTone,
        href: `/tabs/${tab.tabId}`,
        updatedAt: tab.updatedAt,
        startedAt: tab.startedAt,
        participants: tab.participants.map((participant) => ({
          userId: participant.userId,
          displayName: participant.displayName,
          claimedCount: participant.claimedCount,
        })),
        itemCount: tab.itemCount,
        claimedItemCount: tab.claimedItemCount,
        unclaimedItems: tab.unclaimedItems.map((item) => ({
          itemId: item.itemId,
          name: item.name,
          amountLabel: formatCurrencyMinor(fiatMinorFromInteger(item.lineTotalMinor), currency),
        })),
        unclaimedCount: tab.unclaimedCount,
        viewerClaimedCount:
          viewerUserId === null
            ? 0
            : (tab.participants.find((one) => one.userId === viewerUserId)?.claimedCount ??
              0),
        viewerAmountMinor: amountMinor,
      };
    });

    /*
     * Debt compression is per group. Two people who share no group are never
     * netted against each other, so the positions are compressed group by group
     * and the results concatenated — never flattened into one pool first.
     */
    const compressedTransfers = (view?.groups ?? []).flatMap((group) =>
      group.positions === null
        ? []
        : compressDebts(
            group.positions.map((position) => ({
              userId: position.userId,
              netMinor: fiatMinorFromInteger(position.netMinor),
            })),
          ),
    );

    return {
      balanceHero,
      openTabs,
      groups: (groups.data ?? []).map((group) => ({
        id: group._id,
        name: group.displayName,
        memberCount: group.memberCount,
      })),
      recentActivity: (activity.data ?? []).map(toActivityRow),
      /*
       * Both directions now, not just what the viewer owes. The section this
       * feeds is "People" — who you are square with is as much a fact about a
       * person as who you owe, and hiding the credit side made a group where
       * two people owe you look like a group where nothing is outstanding.
       */
      balanceComponents: (view?.components ?? []).map((component) => {
        const owes = component.direction === "owe";
        const counterpartyUserId = owes
          ? component.creditorUserId
          : component.debtorUserId;

        return {
          counterpartyUserId,
          counterpartyName: memberNames[counterpartyUserId] ?? "Someone",
          direction: component.direction,
          currency: component.currency,
          amountMinor: fiatMinorFromInteger(component.amountMinor),
          tabId: component.tabId,
          billId: component.billId,
        };
      }),
      compressedTransfers,
      memberNames,
    };
  }, [balance.data, tabs.data, groups.data, activity.data]);

  if (balance.error || tabs.error || groups.error || activity.error) {
    return { status: "error", hasCachedData, retry, content: EMPTY_CONTENT };
  }

  if (balance.loading || tabs.loading || groups.loading || activity.loading) {
    return { status: "loading", hasCachedData, retry, content: EMPTY_CONTENT };
  }

  return { status: "ready", hasCachedData, retry, content };
}
