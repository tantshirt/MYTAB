"use client";

import { EmptyState } from "@/components/primitives/empty-state";
import { ErrorState } from "@/components/primitives/error-state";
import { SurfaceErrorBoundary } from "@/components/primitives/error-boundary";
import { showSkeleton, type LoadState } from "@/components/primitives/load-state";
import { STATE_COPY } from "@/components/primitives/state-copy";
import {
  ActivityFeed,
  GroupSkeleton,
  OfflineBar,
  OutsideTelegramBar,
  StartTabAction,
  TabCard,
  type ActivityRowData,
} from "@/features/balances";
import { PlusIcon } from "@/components/icons";
import { VisuallyHidden } from "@/components/primitives/visually-hidden";
import { formatAmountLabelForA11y } from "@/lib/domain/a11yAmount";
import {
  avatarTintsForGroup,
  MYTAB_COLORS,
  MYTAB_ELEVATION,
  MYTAB_RADIUS,
  MYTAB_TYPOGRAPHY,
} from "@/lib/theme/tokens";

export const GROUP_COPY = {
  /** §4.2 — no open tabs. */
  emptyTabs: "No tabs yet. Start one from any Telegram group.",
  /** §4.2 — no other members. */
  emptyMembers: "No one else has opened this tab yet.",
  /** §4.3 — group not found, or no longer a member. */
  notAMember: "You're not in this group any more.",
  backToTabs: "Back to your tabs",
  /** §4.3 — query error. */
  error: "Couldn't load this group.",
  retry: STATE_COPY.retry,
  settleUp: "Settle up",
  startTab: "Start a tab",
} as const;

export type GroupMemberView = {
  telegramUserId: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  walletReady: boolean;
  /** Settled up on every open tab in this group. Drives the status dot. */
  settled?: boolean;
};

export type OpenTabView = {
  _id: string;
  name: string;
  status: string;
  updatedAt: number;
  peopleCount?: number;
  totalLabel?: string;
  settledCount?: number;
  totalCount?: number;
};

/** The `balance-hero` card at the top of the group (§1.3). Hidden when zero. */
export type GroupPosition = {
  /** The figure alone, e.g. "฿291.74". Never truncated. */
  amountLabel: string;
  amountA11yLabel?: string;
  /** "You owe Maya" / "Maya owes you". The word that carries the colour. */
  subLine: string;
  tone: "owed" | "settled";
  settleHref?: string;
};

export type GroupSurfaceProps = LoadState & {
  groupId?: string;
  groupName: string;
  defaultCurrency: string;
  recipientAsset: string;
  members: GroupMemberView[];
  openTabs: OpenTabView[];
  activity?: ActivityRowData[];
  position?: GroupPosition;
  /** "not-a-member" and "query" are two different §4.3 rows. */
  error?: "not-a-member" | "query";
  onRetry?: () => void;
  offline?: boolean;
  inTelegram?: boolean;
};

const RELATIVE_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * `new Date(...).toLocaleDateString()` with no locale resolves differently on
 * the server and in the webview — a hydration mismatch (POLISH-SPEC §1.3).
 */
function formatUpdated(timestamp: number, now: number = Date.now()): string {
  const minutes = Math.floor((now - timestamp) / 60_000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d ago`;
  }
  const date = new Date(timestamp);
  return `${date.getDate()} ${RELATIVE_MONTHS[date.getMonth()]}`;
}

function MemberColumn({ member, tint }: { member: GroupMemberView; tint: string }) {
  const initial = member.displayName.trim().charAt(0).toUpperCase() || "?";
  const dotColor = member.settled ? MYTAB_COLORS.settled : MYTAB_COLORS.owed;

  return (
    <li style={{ width: "60px", flex: "none", textAlign: "center" }}>
      <span style={{ position: "relative", display: "inline-block" }}>
        {member.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={member.avatarUrl}
            alt=""
            width={48}
            height={48}
            style={{ width: 48, height: 48, borderRadius: MYTAB_RADIUS.full, objectFit: "cover" }}
          />
        ) : (
          <span
            aria-hidden="true"
            style={{
              width: 48,
              height: 48,
              borderRadius: MYTAB_RADIUS.full,
              background: tint,
              color: "#FFFFFF",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "17px",
              fontWeight: 600,
            }}
          >
            {initial}
          </span>
        )}
        {member.settled !== undefined ? (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              right: 0,
              bottom: 0,
              width: 13,
              height: 13,
              borderRadius: MYTAB_RADIUS.full,
              background: dotColor,
              border: `2.5px solid ${MYTAB_COLORS.paper}`,
            }}
          />
        ) : null}
      </span>
      <span
        style={{
          display: "block",
          minWidth: 0,
          marginTop: "6px",
          fontSize: "12px",
          color: MYTAB_COLORS.inkMuted,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {member.displayName}
        {member.settled !== undefined ? (
          // Semantic colour never travels alone: the dot always has a word.
          <VisuallyHidden>{member.settled ? " — settled up" : " — owes"}</VisuallyHidden>
        ) : null}
      </span>
    </li>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mytab-type-micro-label" style={{ margin: "28px 0 12px" }}>
      {children}
    </h2>
  );
}

/** Group — balance, members, open tabs, activity, start a tab (Story 2.7, §1.3). */
export function GroupSurface({
  groupId,
  groupName,
  defaultCurrency,
  recipientAsset,
  members,
  openTabs,
  activity = [],
  position,
  loading = false,
  hasCachedData = false,
  error,
  onRetry,
  offline = false,
  inTelegram = true,
}: GroupSurfaceProps) {
  if (showSkeleton({ loading, hasCachedData })) {
    return <GroupSkeleton memberCount={Math.max(members.length, 3)} />;
  }

  if (error) {
    return (
      <div style={{ paddingTop: "24px" }}>
        {error === "not-a-member" ? (
          <ErrorState
            headline={GROUP_COPY.notAMember}
            actions={[{ label: GROUP_COPY.backToTabs, href: "/" }]}
          />
        ) : (
          <ErrorState
            headline={GROUP_COPY.error}
            actions={[{ label: GROUP_COPY.retry, onPress: onRetry }]}
          />
        )}
      </div>
    );
  }

  const blockedReason = !inTelegram
    ? STATE_COPY.outsideTelegram
    : offline
      ? STATE_COPY.needsConnection
      : undefined;

  const startTabGroups = groupId
    ? [{ id: groupId, name: groupName, memberCount: members.length }]
    : [];

  /*
   * The member strip is the canonical "row of five" (§1.3), so the tints come from
   * the set-aware allocator rather than a per-id hash: five people into five tints
   * hash all-distinct only 3.8% of the time, which reliably showed two identical
   * bubbles side by side. Sorted inside `avatarTintsForGroup`, so nobody changes
   * colour when a sixth person joins.
   */
  const memberTints = avatarTintsForGroup(members.map((member) => member.telegramUserId));

  return (
    <div style={{ paddingTop: "8px", paddingBottom: "24px" }}>
      <OfflineBar visible={offline} />
      <OutsideTelegramBar visible={!inTelegram} />

      <SurfaceErrorBoundary headline={GROUP_COPY.error} retryLabel={GROUP_COPY.retry}>
        <h1 className="mytab-type-title" style={{ margin: "16px 0 0" }}>
          {groupName}
        </h1>
        <p className="mytab-type-meta" style={{ margin: "6px 0 0" }}>
          Bills in {defaultCurrency} · receive {recipientAsset}
        </p>

        {position ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              marginTop: "20px",
              padding: "20px",
              background: MYTAB_COLORS.surface,
              border: `1px solid ${MYTAB_COLORS.border}`,
              borderRadius: MYTAB_RADIUS.md,
              boxShadow: MYTAB_ELEVATION.cardShadow,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                className="mytab-type-amount-lg mytab-tabular"
                data-mytab-amount
                aria-label={position.amountA11yLabel ?? formatAmountLabelForA11y(position.amountLabel)}
                style={{
                  margin: 0,
                  lineHeight: 1.05,
                  whiteSpace: "nowrap",
                  color:
                    position.tone === "owed" ? MYTAB_COLORS.owed : MYTAB_COLORS.settled,
                }}
              >
                {position.amountLabel}
              </p>
              <p className="mytab-type-meta" style={{ margin: "5px 0 0" }}>
                {position.subLine}
              </p>
            </div>
            {blockedReason ? (
              <span
                aria-disabled="true"
                style={{ ...SETTLE_STYLE, opacity: 0.5 }}
              >
                {GROUP_COPY.settleUp}
              </span>
            ) : (
              <a href={position.settleHref ?? "#settle"} style={SETTLE_STYLE}>
                {GROUP_COPY.settleUp}
              </a>
            )}
          </div>
        ) : null}
        {position && blockedReason ? (
          <p className="mytab-type-meta" style={{ margin: "8px 0 0", textAlign: "right" }}>
            {blockedReason}
          </p>
        ) : null}

        <section>
          <SectionLabel>Members</SectionLabel>
          {members.length === 0 ? (
            <p className="mytab-type-meta" style={{ margin: 0 }}>
              {GROUP_COPY.emptyMembers}
            </p>
          ) : (
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                gap: "14px",
                overflowX: "auto",
              }}
            >
              {members.map((member) => (
                <MemberColumn
                  key={member.telegramUserId}
                  member={member}
                  tint={memberTints.get(member.telegramUserId)!}
                />
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionLabel>Open tabs</SectionLabel>
          {openTabs.length === 0 ? (
            <EmptyState
              headline={GROUP_COPY.emptyTabs}
              action={
                startTabGroups.length > 0 && !blockedReason ? (
                  <StartTabAction groups={startTabGroups} style={START_TAB_STYLE}>
                    <PlusIcon size={18} aria-hidden="true" />
                    {GROUP_COPY.startTab}
                  </StartTabAction>
                ) : undefined
              }
            />
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "12px" }}>
              {openTabs.map((tab, index) => (
                <li key={tab._id}>
                  {/*
                   * The most recent tab is marked by its border alone. It used
                   * to carry a `boxShadow` ring as well, and DESIGN.md bans
                   * shadow for hierarchy on anything that is not a floating
                   * sheet. The old "Most recent tab highlighted." caption is
                   * gone with it — the UI does not explain itself.
                   */}
                  <div
                    style={
                      index === 0
                        ? { borderRadius: MYTAB_RADIUS.md, outline: `1px solid ${MYTAB_COLORS.primary}` }
                        : undefined
                    }
                  >
                    <TabCard
                      tabId={tab._id}
                      name={tab.name}
                      status={tab.status}
                      settledCount={tab.settledCount ?? 0}
                      totalCount={tab.totalCount ?? tab.peopleCount ?? 0}
                      peopleCount={tab.peopleCount}
                      totalLabel={tab.totalLabel}
                      href={`/tabs/${tab._id}`}
                    />
                  </div>
                  <p className="mytab-type-meta" style={{ margin: "6px 0 0" }} suppressHydrationWarning>
                    Updated {formatUpdated(tab.updatedAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionLabel>Activity</SectionLabel>
          <ActivityFeed events={activity} grouped={false} />
        </section>

        {startTabGroups.length > 0 && openTabs.length > 0 ? (
          <div style={{ marginTop: "24px" }}>
            {blockedReason ? (
              <>
                <span aria-disabled="true" style={{ ...START_TAB_STYLE, width: "100%", opacity: 0.5 }}>
                  <PlusIcon size={18} aria-hidden="true" />
                  {GROUP_COPY.startTab}
                </span>
                <p className="mytab-type-meta" style={{ margin: "8px 0 0", textAlign: "center" }}>
                  {blockedReason}
                </p>
              </>
            ) : (
              <StartTabAction
                groups={startTabGroups}
                style={{ ...START_TAB_STYLE, width: "100%" }}
              >
                <PlusIcon size={18} aria-hidden="true" />
                {GROUP_COPY.startTab}
              </StartTabAction>
            )}
          </div>
        ) : null}
      </SurfaceErrorBoundary>
    </div>
  );
}

const SETTLE_STYLE = {
  flex: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "48px",
  padding: "0 20px",
  borderRadius: MYTAB_RADIUS.sm,
  background: MYTAB_COLORS.primary,
  color: "#FFFFFF",
  fontSize: MYTAB_TYPOGRAPHY.body.size,
  fontWeight: 600,
  textDecoration: "none",
  boxShadow: MYTAB_ELEVATION.buttonInset,
} as const;

const START_TAB_STYLE = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  minHeight: "48px",
  padding: "0 20px",
  borderRadius: MYTAB_RADIUS.sm,
  background: MYTAB_COLORS.surface,
  color: MYTAB_COLORS.ink,
  border: `1px solid ${MYTAB_COLORS.border}`,
  fontSize: MYTAB_TYPOGRAPHY.body.size,
  fontWeight: 600,
  cursor: "pointer",
} as const;

export const FIXTURE_GROUP_SURFACE: GroupSurfaceProps = {
  groupId: "groups:fixture-sukhumvit",
  groupName: "Sukhumvit Dinner",
  defaultCurrency: "THB",
  recipientAsset: "USDC",
  position: {
    amountLabel: "฿291.74",
    amountA11yLabel: "291 baht 74",
    subLine: "You owe Maya",
    tone: "owed",
    settleHref: "/?settle=obl-1",
  },
  members: [
    {
      telegramUserId: "user-andre",
      displayName: "Andre",
      walletReady: true,
      settled: false,
    },
    {
      telegramUserId: "user-maya",
      displayName: "Maya",
      walletReady: true,
      settled: true,
    },
    {
      telegramUserId: "user-lin",
      displayName: "Lin",
      walletReady: false,
      settled: false,
    },
  ],
  openTabs: [
    {
      _id: "tabs:fixture-primary",
      name: "Sukhumvit Dinner",
      status: "open",
      updatedAt: Date.now(),
      peopleCount: 5,
      totalLabel: "฿1,840.00",
      settledCount: 1,
      totalCount: 5,
    },
  ],
  activity: [],
};
