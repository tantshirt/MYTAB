"use client";

import Link from "next/link";
import { Lockup } from "@/components/brand/Lockup";
import { PlusIcon } from "@/components/icons";
import { ErrorState } from "@/components/primitives/error-state";
import { SurfaceErrorBoundary } from "@/components/primitives/error-boundary";
import { ListCard } from "@/components/primitives/list-card";
import { showSkeleton, type LoadState } from "@/components/primitives/load-state";
import { STATE_COPY } from "@/components/primitives/state-copy";
import { useReducedMotion } from "@/components/primitives/use-reduced-motion";
import { TabCard } from "./TabCard";
import { ActivityFeed } from "./ActivityFeed";
import { AllSquareWatcher } from "./AllSquareWatcher";
import { LiveTabCard } from "./LiveTabCard";
import { PersonRow } from "./PersonRow";
import { TabsHomeSkeleton, OfflineBar, OutsideTelegramBar } from "./LoadingStates";
import { StartTabAction } from "./StartTabAction";
import { useShareDelta } from "./useShareDelta";
import { MYTAB_COLORS, MYTAB_RADIUS, MYTAB_SPACING } from "@/lib/theme/tokens";
import { formatFiatMinorThb } from "@/lib/domain/format";
import { formatThbMinorForA11y } from "@/lib/domain/a11yAmount";
import {
  formatBalanceHeroParts,
  formatBalanceHeroText,
  type BalanceHeroState,
} from "@/lib/domain/balance";
import { pickLiveTab } from "@/lib/domain/liveTab";
import type { FiatMinor } from "@/lib/domain/money";
import type { ActivityRowData } from "./ActivityFeed";
import type { OpenTabRow } from "./openTabRow";
import { DEBT_COMPRESSION_DISCLAIMER } from "@/lib/domain/debtCompression";
import type { CompressedTransfer } from "@/lib/domain/debtCompression";

export const TABS_HOME_COPY = {
  /** §4.2 — no groups and no tabs. The first thing anyone ever sees. */
  emptyHeadline: "Start a tab.\nDrop it in the chat.",
  emptyBody:
    "Everyone taps what they had, on their own phone, at the same time. My Tab works out each person's exact share.",
  /** §4.2 — groups exist, none has an open tab. */
  emptyNoOpenTabs: "No open tabs in your groups.",
  /** §4.3 — query error. */
  error: "Couldn't load your tabs.",
  retry: STATE_COPY.retry,
  startTab: "Start a tab",
  startTabShort: "Start a tab",
  openBot: "Open bot",
  nothingLive: "Nothing live right now",
  alsoOpen: "Also open",
  openTabs: "Open tabs",
  people: "People",
  justHappened: "Just happened",
  recent: "Recent",
  settleWith: (name: string) => `Settle with ${name}`,
} as const;

export type BalanceComponentRow = {
  counterpartyUserId: string;
  counterpartyName: string;
  direction: "owe" | "owed";
  amountMinor: FiatMinor;
  tabId: string;
  billId: string;
};

export type TabsHomeSurfaceProps = LoadState & {
  /**
   * The viewer's net position. **Absent when no position has been read yet.**
   *
   * `BalanceHeroState` has no "unknown" variant, so a required prop would force
   * every caller to assert `owed`, `settled` or `all_square` — and "All square"
   * over unread debt is the trust defect *Money Legibility* forbids.
   */
  balanceHero?: BalanceHeroState;
  openTabs: OpenTabRow[];
  groups: Array<{ id: string; name: string; memberCount: number }>;
  recentActivity: ActivityRowData[];
  balanceComponents?: BalanceComponentRow[];
  compressedTransfers?: CompressedTransfer[];
  memberNames?: Record<string, string>;
  /** The read failed. Renders §4.3 copy with a retry, in the flow. */
  error?: boolean;
  onRetry?: () => void;
  offline?: boolean;
  /**
   * Posts the completion card to the group when the all-square moment fires.
   * Absent → the moment offers only `Done` rather than a dead `Share to group`.
   */
  onShareAllSquare?: () => void;
  inTelegram?: boolean;
};

/**
 * The Telegram bot this deployment belongs to, from
 * `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`. Inlined at build time by Next; empty on
 * a deployment that has not set it, which is a real state and not an error.
 */
const BOT_HANDLE = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "").trim();

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mytab-type-micro-label" style={{ margin: "0 0 10px" }}>
      {children}
    </h2>
  );
}

const PILL_TONE = {
  owed: { background: MYTAB_COLORS.owedSoft, color: MYTAB_COLORS.owed },
  settled: { background: MYTAB_COLORS.settledSoft, color: MYTAB_COLORS.settled },
  all_square: { background: MYTAB_COLORS.settledSoft, color: MYTAB_COLORS.settled },
} as const;

/**
 * The viewer's whole position, compressed to one pill in the top bar.
 *
 * It exists because the live tab takes the 42px slot: the exact overall figure
 * still has to be on screen without being the loudest thing on it. It carries
 * the figure in full — a pill is not a licence to round.
 */
function PositionPill({ state }: { state: BalanceHeroState }) {
  const { label, figure } = formatBalanceHeroParts(state);
  const tone = PILL_TONE[state.kind];

  return (
    <span
      className="mytab-tabular"
      data-mytab-amount
      aria-label={formatBalanceHeroText(state)}
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: "6px",
        borderRadius: MYTAB_RADIUS.full,
        padding: "7px 12px",
        fontSize: "13px",
        fontWeight: 600,
        letterSpacing: "-0.006em",
        whiteSpace: "nowrap",
        ...tone,
      }}
    >
      {label ? (
        <span aria-hidden="true" style={{ fontWeight: 500, opacity: 0.85 }}>
          {label}
        </span>
      ) : null}
      <span aria-hidden="true">{figure}</span>
    </span>
  );
}

/**
 * Wordmark, position, and the one way to start a tab.
 *
 * `Start a tab` used to be half of a 50/50 button pair under the hero, which
 * cost the most valuable band on the screen. As a round target beside the
 * wordmark it is always reachable and never competes with the live tab.
 *
 * The pill is allowed to wrap under the wordmark: at 320px with the largest
 * platform text setting, wordmark + pill + a 44px target do not fit on one
 * line, and an amount may never truncate to make them.
 */
function HomeTopBar({
  balanceHero,
  groups,
  blockedReason,
}: {
  balanceHero?: BalanceHeroState;
  groups: Array<{ id: string; name: string; memberCount: number }>;
  blockedReason?: string;
}) {
  /*
   * The + is disabled ONLY by a real, stated reason (offline, outside
   * Telegram). Having no group is not one: `StartTabAction` opens a personal
   * tab in that case (D-06). Before this, the single control on the home
   * screen was an inert `<span aria-disabled>` for every first-time user.
   */
  const disabled = blockedReason !== undefined;

  const target = {
    width: "44px",
    height: "44px",
    minHeight: "44px",
    padding: 0,
    borderRadius: MYTAB_RADIUS.full,
    flex: "none",
  } as const;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        alignItems: "center",
        gap: MYTAB_SPACING["3"],
        paddingTop: MYTAB_SPACING["4"],
      }}
    >
      {/*
        The position sits UNDER the wordmark rather than beside it. Beside it
        the row is wordmark + a never-truncating amount + a 44px target, which
        the sweep measured 10px past a 320px viewport at the largest platform
        text setting. A pill is not a licence to shorten an amount, so the row
        gives way instead.
      */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: MYTAB_SPACING["2"],
          minWidth: 0,
        }}
      >
        <Lockup size={17} />
        {balanceHero ? <PositionPill state={balanceHero} /> : null}
      </div>

      {disabled ? (
        <span
          className="mytab-button-primary"
          aria-disabled="true"
          aria-label={TABS_HOME_COPY.startTab}
          style={target}
        >
          <PlusIcon size={20} aria-hidden="true" />
        </span>
      ) : (
        <StartTabAction groups={groups} className="mytab-button-primary" style={target}>
          <PlusIcon size={20} aria-hidden="true" />
          <span className="mytab-visually-hidden">{TABS_HOME_COPY.startTab}</span>
        </StartTabAction>
      )}
    </div>
  );
}

/**
 * What the screen shows when nothing is live: the position, big, and the one
 * payment that clears it where there is exactly one.
 *
 * "Suggested transfers" stopped being a section here. As a section it was a
 * list of sentences about other people's debts sitting below the fold; as the
 * line under your own figure it is the answer to the only question the screen
 * is being asked.
 */
function QuietPositionCard({
  balanceHero,
  balanceComponents,
  compressedTransfers,
  memberNames,
}: {
  balanceHero: BalanceHeroState;
  balanceComponents: BalanceComponentRow[];
  compressedTransfers: CompressedTransfer[];
  memberNames: Record<string, string>;
}) {
  const { label, figure } = formatBalanceHeroParts(balanceHero);
  const color =
    balanceHero.kind === "owed"
      ? MYTAB_COLORS.owed
      : balanceHero.kind === "settled"
        ? MYTAB_COLORS.settled
        : MYTAB_COLORS.ink;

  /*
   * One outstanding bill is the only case with an unambiguous next action, so
   * it is the only case that gets a button. Two or more and the People rows
   * below carry it — inventing a "settle everything" destination that does not
   * exist would be worse than one extra tap.
   */
  const only = balanceComponents.length === 1 ? balanceComponents[0]! : null;

  const oneTransfer =
    compressedTransfers.length === 1 ? compressedTransfers[0]! : null;
  const transferLine = oneTransfer
    ? `One payment to ${memberNames[oneTransfer.toUserId] ?? "them"} clears everything`
    : compressedTransfers.length > 1
      ? DEBT_COMPRESSION_DISCLAIMER
      : null;

  return (
    <section
      className="mytab-card"
      style={{ padding: MYTAB_SPACING["5"], borderColor: MYTAB_COLORS.borderStrong }}
    >
      {label ? (
        <p aria-hidden="true" className="mytab-type-micro-label" style={{ margin: 0 }}>
          {label}
        </p>
      ) : null}
      <p
        className="mytab-type-amount-hero mytab-tabular"
        data-mytab-amount
        aria-label={formatBalanceHeroText(balanceHero)}
        style={{
          margin: "2px 0 0",
          color,
          whiteSpace: "nowrap",
          fontSize: "clamp(32px, 10.8vw, 42px)",
          lineHeight: 1.1,
        }}
      >
        {figure}
      </p>

      {transferLine ? (
        <p className="mytab-type-meta" style={{ margin: "6px 0 0" }}>
          {transferLine}
        </p>
      ) : null}

      {only ? (
        <Link
          href={`/tabs/${only.tabId}?bill=${only.billId}`}
          className="mytab-button-primary"
          style={{ marginTop: MYTAB_SPACING["5"] }}
        >
          {TABS_HOME_COPY.settleWith(only.counterpartyName)}
        </Link>
      ) : null}
    </section>
  );
}

/** §4.2 first run — one sentence, four faces' worth of nothing, one button. */
function FirstRun({
  groups,
  blockedReason,
}: {
  groups: Array<{ id: string; name: string; memberCount: number }>;
  blockedReason?: string;
}) {
  const noGroups = groups.length === 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: `${MYTAB_SPACING["8"]} ${MYTAB_SPACING["4"]} 0`,
      }}
    >
      <Lockup size={30} />
      <h2
        className="mytab-type-amount-md"
        style={{
          margin: `${MYTAB_SPACING["6"]} 0 0`,
          whiteSpace: "pre-line",
          lineHeight: 1.25,
          textWrap: "pretty",
        }}
      >
        {TABS_HOME_COPY.emptyHeadline}
      </h2>
      <p
        className="mytab-type-body"
        style={{
          margin: `${MYTAB_SPACING["3"]} 0 0`,
          maxWidth: "280px",
          color: MYTAB_COLORS.inkMuted,
          lineHeight: 1.5,
          textWrap: "pretty",
        }}
      >
        {TABS_HOME_COPY.emptyBody}
      </p>

      {blockedReason !== undefined ? (
        <>
          <span
            className="mytab-button-primary"
            aria-disabled="true"
            style={{ marginTop: MYTAB_SPACING["7"], maxWidth: "300px" }}
          >
            <PlusIcon size={18} aria-hidden="true" />
            {TABS_HOME_COPY.startTab}
          </span>
          <p className="mytab-type-meta" style={{ margin: `${MYTAB_SPACING["2"]} 0 0` }}>
            {blockedReason}
          </p>
        </>
      ) : (
        <StartTabAction
          groups={groups}
          className="mytab-button-primary"
          style={{ marginTop: MYTAB_SPACING["7"], maxWidth: "300px" }}
        >
          <PlusIcon size={18} aria-hidden="true" />
          {TABS_HOME_COPY.startTab}
        </StartTabAction>
      )}

      {/*
        The group door, secondary. A tab started here is a personal one and the
        invite code admits everyone else, so the bot is an alternative rather
        than a prerequisite — which is what `noGroupContext` used to claim.
      */}
      {noGroups && blockedReason === undefined && BOT_HANDLE ? (
        <a
          href={`https://t.me/${BOT_HANDLE}`}
          className="mytab-type-meta"
          style={{
            display: "inline-flex",
            alignItems: "center",
            minHeight: "44px",
            marginTop: MYTAB_SPACING["2"],
            color: MYTAB_COLORS.primary,
          }}
        >
          {TABS_HOME_COPY.openBot}
        </a>
      ) : null}
    </div>
  );
}

/**
 * Tabs home.
 *
 * The order is the whole redesign: whatever is HAPPENING first, then what is
 * merely open, then who you are square with, then what just happened. Before
 * this the surface was six sections of identical cards in a fixed order, so a
 * tab five people were claiming on at that moment looked exactly like a group
 * roster.
 */
export function TabsHomeSurface({
  balanceHero,
  openTabs,
  groups,
  recentActivity,
  balanceComponents = [],
  compressedTransfers = [],
  memberNames = {},
  loading = false,
  hasCachedData = false,
  error = false,
  onRetry,
  offline = false,
  onShareAllSquare,
  inTelegram = true,
}: TabsHomeSurfaceProps) {
  const reducedMotion = useReducedMotion();

  /*
   * The all-square moment is no longer a `showAllSquare` prop nobody ever
   * passed. `AllSquareWatcher` subscribes each open tab to
   * `balances.billCompletion` and fires on the live completion EDGE — never on
   * mount over an already-complete bill, and never on the group net position,
   * which is a different fact (EXPERIENCE, *Money Legibility*).
   */
  const allSquareCast = Object.entries(memberNames).map(([userId, displayName]) => ({
    userId,
    displayName,
  }));

  const liveTab = pickLiveTab(openTabs);
  const otherTabs = openTabs.filter((tab) => tab.tabId !== liveTab?.tabId);

  const delta = useShareDelta({
    tabId: liveTab?.tabId ?? null,
    shareMinor: liveTab?.viewerAmountMinor ?? null,
    tone: liveTab?.amountTone ?? null,
    activity: recentActivity,
  });

  // A skeleton only on a first paint with nothing cached — never on a tab
  // switch, never over data we already have (§2.9).
  if (showSkeleton({ loading, hasCachedData })) {
    return <TabsHomeSkeleton />;
  }

  const blockedReason = !inTelegram
    ? STATE_COPY.outsideTelegram
    : offline
      ? STATE_COPY.needsConnection
      : undefined;

  const nothingAtAll =
    openTabs.length === 0 && balanceComponents.length === 0 && !balanceHero;

  return (
    <div style={{ paddingBottom: MYTAB_SPACING["7"] }}>
      <OfflineBar visible={offline} />
      <OutsideTelegramBar visible={!inTelegram} />

      {error ? (
        <div style={{ marginTop: MYTAB_SPACING["4"] }}>
          <ErrorState
            headline={TABS_HOME_COPY.error}
            actions={[{ label: TABS_HOME_COPY.retry, onPress: onRetry }]}
          />
        </div>
      ) : null}

      <SurfaceErrorBoundary headline={TABS_HOME_COPY.error} retryLabel={TABS_HOME_COPY.retry}>
        <HomeTopBar
          balanceHero={nothingAtAll ? undefined : balanceHero}
          groups={groups}
          blockedReason={blockedReason}
        />

        <AllSquareWatcher
          tabs={openTabs.map((tab) => ({
            tabId: tab.tabId,
            name: tab.name,
            totalLabel: tab.totalLabel,
          }))}
          members={allSquareCast}
          onShare={onShareAllSquare}
        />

        {nothingAtAll ? (
          <FirstRun groups={groups} blockedReason={blockedReason} />
        ) : (
          <>
            <div style={{ marginTop: MYTAB_SPACING["5"] }}>
              {liveTab ? (
                <LiveTabCard
                  tabId={liveTab.tabId}
                  name={liveTab.name}
                  href={liveTab.href}
                  startedAt={liveTab.startedAt}
                  participants={liveTab.participants}
                  shareLabel={liveTab.amountLabel ?? formatFiatMinorThb(0 as FiatMinor)}
                  shareA11yLabel={liveTab.amountA11yLabel}
                  itemCount={liveTab.itemCount}
                  claimedItemCount={liveTab.claimedItemCount}
                  unclaimedItems={liveTab.unclaimedItems}
                  unclaimedCount={liveTab.unclaimedCount}
                  viewerClaimedCount={liveTab.viewerClaimedCount}
                  delta={delta}
                  reducedMotion={reducedMotion}
                  arriving={hasCachedData}
                />
              ) : balanceHero ? (
                <QuietPositionCard
                  balanceHero={balanceHero}
                  balanceComponents={balanceComponents}
                  compressedTransfers={compressedTransfers}
                  memberNames={memberNames}
                />
              ) : null}
            </div>

            {otherTabs.length > 0 ? (
              <section style={{ marginTop: MYTAB_SPACING["6"] }}>
                <SectionLabel>
                  {liveTab ? TABS_HOME_COPY.alsoOpen : TABS_HOME_COPY.openTabs}
                </SectionLabel>
                <ul
                  style={{
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    display: "grid",
                    gap: MYTAB_SPACING["3"],
                  }}
                >
                  {otherTabs.map((tab) => (
                    <li key={tab.tabId}>
                      <TabCard {...tab} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : openTabs.length === 0 ? (
              <p
                className="mytab-type-meta"
                style={{ margin: `${MYTAB_SPACING["6"]} 0 0` }}
              >
                {TABS_HOME_COPY.emptyNoOpenTabs}
              </p>
            ) : null}

            {balanceComponents.length > 0 ? (
              <section style={{ marginTop: MYTAB_SPACING["6"] }}>
                <SectionLabel>{TABS_HOME_COPY.people}</SectionLabel>
                <ListCard>
                  {balanceComponents.map((component) => (
                    <PersonRow
                      key={`${component.tabId}-${component.billId}`}
                      userId={component.counterpartyUserId}
                      name={component.counterpartyName}
                      direction={component.direction}
                      amount={formatFiatMinorThb(component.amountMinor)}
                      amountA11yLabel={formatThbMinorForA11y(component.amountMinor)}
                      href={`/tabs/${component.tabId}?bill=${component.billId}`}
                    />
                  ))}
                </ListCard>
              </section>
            ) : null}

            {/* §4.2: with no recent activity the section is omitted entirely. */}
            {recentActivity.length > 0 ? (
              <section style={{ marginTop: MYTAB_SPACING["6"] }}>
                <SectionLabel>
                  {liveTab ? TABS_HOME_COPY.justHappened : TABS_HOME_COPY.recent}
                </SectionLabel>
                <ActivityFeed
                  events={recentActivity.slice(0, liveTab ? 2 : 5)}
                  grouped={false}
                />
              </section>
            ) : null}
          </>
        )}
      </SurfaceErrorBoundary>
    </div>
  );
}
