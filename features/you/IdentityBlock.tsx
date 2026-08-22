"use client";

import { avatarTintForUserId, MYTAB_COLORS, MYTAB_RADIUS, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";
import { YOU_COPY } from "./copy";
import type { YouViewer } from "./types";

export type IdentityBlockProps = {
  viewer: YouViewer;
};

/** Name and face where a key could have gone. Never a silhouette (POLISH-SPEC §3.2). */
export function IdentityBlock({ viewer }: IdentityBlockProps) {
  const fullName = [viewer.firstName, viewer.lastName].filter(Boolean).join(" ");
  const initial = viewer.firstName.trim().charAt(0).toUpperCase() || "?";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
      <span
        style={{
          flex: "none",
          width: "60px",
          height: "60px",
          borderRadius: MYTAB_RADIUS.full,
          overflow: "hidden",
          background: avatarTintForUserId(viewer.userId),
          color: MYTAB_COLORS.surface,
          fontSize: "22px",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {viewer.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={viewer.photoUrl}
            alt=""
            width={60}
            height={60}
            style={{ width: "60px", height: "60px", objectFit: "cover" }}
          />
        ) : (
          initial
        )}
      </span>

      <span style={{ minWidth: 0 }}>
        <span
          style={{
            display: "block",
            fontSize: MYTAB_TYPOGRAPHY.title.size,
            fontWeight: MYTAB_TYPOGRAPHY.title.weight,
            letterSpacing: MYTAB_TYPOGRAPHY.title.tracking,
            color: MYTAB_COLORS.ink,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {fullName}
        </span>
        {viewer.username ? (
          <span
            style={{
              display: "block",
              marginTop: "2px",
              fontSize: MYTAB_TYPOGRAPHY.meta.size,
              color: MYTAB_COLORS.inkMuted,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {`@${viewer.username}`}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export type IdentityErrorProps = {
  onRetry?: () => void;
};

/** Convex viewer query failed. The cards below still render (POLISH-SPEC §3.4). */
export function IdentityError({ onRetry }: IdentityErrorProps) {
  return (
    <div>
      <p
        className="mytab-type-body"
        style={{ margin: 0, fontWeight: 500, color: MYTAB_COLORS.ink }}
      >
        {YOU_COPY.viewerFailed}
      </p>
      <button type="button" className="mytab-link-button" onClick={onRetry}>
        {YOU_COPY.retry}
      </button>
    </div>
  );
}
