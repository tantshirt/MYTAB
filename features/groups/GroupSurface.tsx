"use client";

import Link from "next/link";
import { MYTAB_COLORS } from "@/lib/theme/tokens";
import { avatarTintForUserId } from "@/lib/theme/tokens";

export type GroupMemberView = {
  telegramUserId: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  walletReady: boolean;
};

export type OpenTabView = {
  _id: string;
  name: string;
  status: string;
  updatedAt: number;
};

export type GroupSurfaceProps = {
  groupName: string;
  defaultCurrency: string;
  recipientAsset: string;
  members: GroupMemberView[];
  openTabs: OpenTabView[];
};

function MemberAvatar({ member }: { member: GroupMemberView }) {
  const initial = member.displayName.trim().charAt(0).toUpperCase() || "?";
  const tint = avatarTintForUserId(member.telegramUserId);

  if (member.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={member.avatarUrl}
        alt=""
        width={32}
        height={32}
        style={{ borderRadius: "999px", objectFit: "cover" }}
      />
    );
  }

  return (
    <span
      aria-hidden
      style={{
        width: 32,
        height: 32,
        borderRadius: "999px",
        background: tint,
        color: "#FFFFFF",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "13px",
        fontWeight: 600,
      }}
    >
      {initial}
    </span>
  );
}

/**
 * Group surface — members, defaults, and open tabs (Story 2.7).
 */
export function GroupSurface({
  groupName,
  defaultCurrency,
  recipientAsset,
  members,
  openTabs,
}: GroupSurfaceProps) {
  const primaryTab = openTabs[0];

  return (
    <div style={{ paddingTop: "8px", paddingBottom: "24px" }}>
      <h1 className="mytab-type-title" style={{ margin: 0 }}>
        {groupName}
      </h1>

      <p className="mytab-type-meta" style={{ marginTop: "8px" }}>
        Bills in {defaultCurrency} · receive {recipientAsset}
      </p>

      <section style={{ marginTop: "24px" }}>
        <h2 className="mytab-type-micro-label">Members</h2>
        <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "grid", gap: "12px" }}>
          {members.map((member) => (
            <li
              key={member.telegramUserId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px",
                background: MYTAB_COLORS.surface,
                border: `1px solid ${MYTAB_COLORS.border}`,
                borderRadius: "12px",
              }}
            >
              <MemberAvatar member={member} />
              <div style={{ flex: 1 }}>
                <p className="mytab-type-label" style={{ margin: 0 }}>
                  {member.displayName}
                </p>
                <p className="mytab-type-meta" style={{ margin: "2px 0 0" }}>
                  {member.walletReady ? "Wallet ready" : "Wallet not set up"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginTop: "32px" }}>
        <h2 className="mytab-type-micro-label">Open tabs</h2>

        {openTabs.length === 0 ? (
          <div style={{ marginTop: "12px" }}>
            <p className="mytab-type-body" style={{ color: MYTAB_COLORS.inkMuted }}>
              No tabs yet. Start one from any Telegram group.
            </p>
            <p className="mytab-type-meta" style={{ marginTop: "12px" }}>
              Type /tab in your group chat to get started.
            </p>
          </div>
        ) : (
          <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "grid", gap: "12px" }}>
            {openTabs.map((tab, index) => {
              const isPrimary = index === 0;
              return (
                <li key={tab._id}>
                  <Link
                    href={`/tabs/${tab._id}`}
                    className="mytab-card"
                    style={{
                      display: "block",
                      padding: "20px",
                      textDecoration: "none",
                      color: "inherit",
                      borderColor: isPrimary ? MYTAB_COLORS.primary : MYTAB_COLORS.border,
                      boxShadow: isPrimary
                        ? `0 0 0 1px ${MYTAB_COLORS.primarySoft}`
                        : undefined,
                    }}
                  >
                    <p className="mytab-type-label" style={{ margin: 0 }}>
                      {tab.name}
                    </p>
                    <p className="mytab-type-meta" style={{ margin: "4px 0 0" }}>
                      {tab.status} · updated {new Date(tab.updatedAt).toLocaleDateString()}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {primaryTab ? (
          <p className="mytab-type-meta" style={{ marginTop: "12px" }}>
            Most recent tab highlighted.
          </p>
        ) : null}
      </section>
    </div>
  );
}

export const FIXTURE_GROUP_SURFACE: GroupSurfaceProps = {
  groupName: "Sukhumvit Dinner",
  defaultCurrency: "THB",
  recipientAsset: "USDC",
  members: [
    {
      telegramUserId: "user-andre",
      displayName: "Andre",
      walletReady: true,
    },
    {
      telegramUserId: "user-maya",
      displayName: "Maya",
      walletReady: true,
    },
    {
      telegramUserId: "user-lin",
      displayName: "Lin",
      walletReady: false,
    },
  ],
  openTabs: [
    {
      _id: "tabs:fixture-primary",
      name: "Sukhumvit Dinner",
      status: "draft",
      updatedAt: Date.now(),
    },
  ],
};
