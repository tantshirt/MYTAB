"use client";

import { Lockup } from "@/components/brand/Lockup";
import { LAUNCH_LQIP } from "@/lib/theme/launchImagery";
import { MYTAB_COLORS } from "@/lib/theme/tokens";
import type { NamedWalletProvider } from "@/lib/wallet/providers";
import { CONNECT_COPY } from "./connectCopy";

export type ConnectSheetStatus = "idle" | "linking" | "failed";

export type ConnectSheetProps = {
  status?: ConnectSheetStatus;
  errorMessage?: string;
  onConnectNamed: (provider: NamedWalletProvider) => void;
  onUseMyTabWallet: () => void;
  onSkip: () => void;
};

const NAMED: Array<{ provider: NamedWalletProvider; label: string; primary?: boolean }> = [
  { provider: "phantom", label: CONNECT_COPY.phantom, primary: true },
  { provider: "solflare", label: CONNECT_COPY.solflare },
  { provider: "backpack", label: CONNECT_COPY.backpack },
];

/**
 * Photographic first-run connect gate (D-13, D-25). No amounts. Paper on ink.
 */
export function ConnectSheet({
  status = "idle",
  errorMessage,
  onConnectNamed,
  onUseMyTabWallet,
  onSkip,
}: ConnectSheetProps) {
  const busy = status === "linking";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={CONNECT_COPY.sheetLabel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 55,
        overflow: "hidden",
        background: MYTAB_COLORS.ink,
        fontFamily: "var(--mytab-font-family)",
      }}
    >
      <picture>
        <source srcSet="/launch/first-run.avif" type="image/avif" />
        <source srcSet="/launch/first-run.webp" type="image/webp" />
        <img
          src="/launch/first-run.webp"
          alt=""
          aria-hidden="true"
          decoding="async"
          loading="eager"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            backgroundImage: `url("${LAUNCH_LQIP["first-run"]}")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      </picture>

      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(10,32,56,0.22) 0%, rgba(10,32,56,0.08) 18%, rgba(10,32,56,0.72) 42%, rgba(10,32,56,0.97) 68%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          insetInline: 0,
          bottom: 0,
          padding: "0 20px calc(24px + var(--app-pad-bottom, 0px))",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: "10px",
          color: "#FFFFFF",
        }}
      >
        <Lockup
          size={28}
          tone="paper"
          style={{ color: "#FFFFFF", WebkitTextFillColor: "#FFFFFF" }}
        />
        <h1
          style={{
            margin: 0,
            fontSize: "25px",
            fontWeight: 600,
            letterSpacing: "-0.028em",
            textWrap: "balance",
            color: "#FFFFFF",
            WebkitTextFillColor: "#FFFFFF",
            textShadow: "0 1px 2px rgba(10,32,56,0.45)",
          }}
        >
          {CONNECT_COPY.title}
        </h1>
        <p
          style={{
            margin: 0,
            maxWidth: "34ch",
            fontSize: "14px",
            lineHeight: 1.55,
            color: "#FFFFFF",
            WebkitTextFillColor: "rgba(255,255,255,0.78)",
          }}
        >
          {CONNECT_COPY.body}
        </p>

        {status === "failed" ? (
          <p
            role="alert"
            style={{
              margin: "4px 0 0",
              maxWidth: "34ch",
              fontSize: "13px",
              lineHeight: 1.45,
              color: "#F6C7CF",
            }}
          >
            {errorMessage ?? CONNECT_COPY.failed}
          </p>
        ) : null}

        {status === "linking" ? (
          <p
            role="status"
            aria-live="polite"
            style={{ margin: "4px 0 0", fontSize: "13px", color: "rgba(255,255,255,0.74)" }}
          >
            {CONNECT_COPY.linking}
          </p>
        ) : null}

        {NAMED.map((entry) => (
          <button
            key={entry.provider}
            type="button"
            disabled={busy}
            onClick={() => onConnectNamed(entry.provider)}
            style={{
              width: "100%",
              minHeight: "48px",
              border: entry.primary ? "none" : "1px solid rgba(255,255,255,0.28)",
              borderRadius: "10px",
              background: entry.primary ? MYTAB_COLORS.paper : "transparent",
              color: entry.primary ? MYTAB_COLORS.ink : "#FFFFFF",
              fontFamily: "var(--mytab-font-family)",
              fontSize: "15px",
              fontWeight: 600,
              letterSpacing: "-0.006em",
              boxShadow: entry.primary ? "inset 0 -1px 0 rgba(10,32,56,0.16)" : "none",
              cursor: busy ? "wait" : "pointer",
              opacity: busy ? 0.7 : 1,
            }}
          >
            {entry.label}
          </button>
        ))}

        <button
          type="button"
          disabled={busy}
          onClick={onUseMyTabWallet}
          style={{
            width: "100%",
            minHeight: "48px",
            border: "1px solid rgba(255,255,255,0.28)",
            borderRadius: "10px",
            background: "transparent",
            color: "#FFFFFF",
            fontFamily: "var(--mytab-font-family)",
            fontSize: "15px",
            fontWeight: 600,
            cursor: busy ? "wait" : "pointer",
            opacity: busy ? 0.7 : 1,
          }}
        >
          {CONNECT_COPY.embedded}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={onSkip}
          style={{
            width: "100%",
            minHeight: "44px",
            border: "none",
            background: "transparent",
            color: "#FFFFFF",
            WebkitTextFillColor: "rgba(255,255,255,0.78)",
            fontFamily: "var(--mytab-font-family)",
            fontSize: "14px",
            fontWeight: 500,
            cursor: busy ? "wait" : "pointer",
          }}
        >
          {CONNECT_COPY.skip}
        </button>
        <p
          style={{
            margin: 0,
            maxWidth: "34ch",
            fontSize: "12px",
            lineHeight: 1.45,
            color: "#FFFFFF",
            WebkitTextFillColor: "rgba(255,255,255,0.56)",
          }}
        >
          {CONNECT_COPY.skipHint}
        </p>
      </div>
    </div>
  );
}
